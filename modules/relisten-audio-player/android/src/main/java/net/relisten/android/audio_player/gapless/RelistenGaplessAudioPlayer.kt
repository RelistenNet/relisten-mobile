package net.relisten.android.audio_player.gapless

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import expo.modules.kotlin.AppContext
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import net.relisten.android.audio_player.gapless.internal.ExoPlayerLifecycle
import net.relisten.android.audio_player.gapless.internal.PlaybackUpdates
import net.relisten.android.audio_player.gapless.internal.StreamManagement
import java.util.concurrent.CompletableFuture
import java.util.concurrent.FutureTask

class RelistenGaplessAudioPlayer(internal val appContext: AppContext) {
    var delegate: RelistenGaplessAudioPlayerDelegate? = null
    internal val reactContext: Context

    internal var exoPlayer: Player? = null
    internal var exoPlayerFuture: CompletableFuture<Player> = CompletableFuture()

    internal var activeStream: RelistenGaplessAudioStream? = null
    internal var nextStream: RelistenGaplessAudioStream? = null

    internal val scope = MainScope()

    internal val exoplayerLifecycle = ExoPlayerLifecycle(this)
    internal val streamManagement = StreamManagement(this)
    internal val playbackUpdates = PlaybackUpdates(this)

    init {
        if (appContext.reactContext == null) {
            throw Exception("appContext.reactContext is null! (this shouldn't happen?)")
        }

        reactContext = appContext.reactContext!!
        exoplayerLifecycle.setupExoPlayer()
    }

    private val controllerHandler by lazy { Handler(reactContext.mainLooper) }

    private fun isOnControllerThread(): Boolean = Looper.myLooper() == controllerHandler.looper

    private fun runOnControllerThread(block: (Player) -> Unit) {
        if (isOnControllerThread()) {
            exoPlayer?.let(block)
            return
        }

        controllerHandler.post {
            exoPlayer?.let(block)
        }
    }

    private fun <T> callOnControllerThread(block: (Player) -> T): T? {
        if (isOnControllerThread()) {
            return exoPlayer?.let(block)
        }

        val task = FutureTask<T?> {
            exoPlayer?.let(block)
        }
        controllerHandler.post(task)
        return task.get()
    }

    val currentDuration: Double?
        get() {
            return callOnControllerThread {
                it.duration / 1000.0
            }
        }

    val elapsed: Double?
        get() {
            return callOnControllerThread {
                it.currentPosition / 1000.0
            }
        }

    val activeTrackDownloadedBytes: Long?
        get() {
            return callOnControllerThread {
                it.bufferedPercentage.toLong()
            }
        }

    val activeTrackTotalBytes: Long?
        get() {
            return callOnControllerThread {
                100L
            }
        }

    var volume: Float
        get() {
            return callOnControllerThread {
                it.deviceVolume / 100.0f
            } ?: 0.0f
        }
        set(newValue) {
            runOnControllerThread {
                it.setDeviceVolume((newValue * 100).toInt(), 0)
            }
        }

    fun setRepeatMode(repeatMode: Int) {
        runOnControllerThread {
            it.repeatMode = when (repeatMode) {
                2 -> Player.REPEAT_MODE_ONE
                3 -> Player.REPEAT_MODE_ALL
                else -> Player.REPEAT_MODE_OFF
            }
        }
    }

    fun setShuffleMode(shuffleMode: Int) {
        runOnControllerThread {
            it.shuffleModeEnabled = shuffleMode == 2
        }
    }

    internal var _currentState: RelistenPlaybackState? = null
    var currentState: RelistenPlaybackState
        get() {
            return _currentState ?: RelistenPlaybackState.Stopped
        }
        set(newValue) {
            val dispatchUpdate = _currentState != newValue

            _currentState = newValue

            if (dispatchUpdate) {
                delegate?.playbackStateChanged(this@RelistenGaplessAudioPlayer, newValue)
            }
        }

    fun play(streamable: RelistenGaplessStreamable, startingAtMs: Long? = null) {
        val activeStream = activeStream
        val nextStream = nextStream

        if (activeStream != null && nextStream != null && nextStream.streamable.identifier == streamable.identifier) {
            next()
        }
        else if (activeStream != null && startingAtMs != null && activeStream.streamable.identifier == streamable.identifier) {
            seekToTime(startingAtMs)
        }

        playStreamableImmediately(streamable, startingAtMs)
    }

    private fun maybeTearDownNextStream() {
        if (nextStream != null) {
            exoPlayer?.removeMediaItem(1)
            nextStream = null
        }
    }

    private fun maybeTearDownActiveStream() {
        if (activeStream != null) {
            exoPlayer?.removeMediaItem(0)
            activeStream = null
        }
    }

    fun setNextStream(streamable: RelistenGaplessStreamable?) {
        scope.launch {
            val exoplayer = exoplayerLifecycle.maybeSetupExoPlayer()

            if (streamable == null) {
                maybeTearDownNextStream()

                return@launch
            }

            if (nextStream?.streamable?.identifier == streamable.identifier) {
                return@launch
            }

            val newNextStream = streamManagement.buildStream(streamable)
            nextStream = newNextStream

            logExoPlayerState("setNextStream(); pre-change", exoplayer)

            exoplayer.addMediaItem(exoplayer.currentMediaItemIndex + 1, newNextStream.mediaItem)

            if (exoplayer.currentMediaItemIndex + 2 < exoplayer.mediaItemCount) {
                exoplayer.removeMediaItems(exoplayer.currentMediaItemIndex + 2, exoplayer.mediaItemCount)
            }

            logExoPlayerState("setNextStream(); post-change", exoplayer)
        }
    }

    fun resume() {
        if (exoPlayer != null) {
            scope.launch {
                exoPlayer?.play()
            }
        }
    }

    fun pause() {
        if (exoPlayer != null) {
            scope.launch {
                exoPlayer?.pause()
            }
        }
    }

    fun stop() {
        if (exoPlayer != null) {
            scope.launch {
                exoPlayer?.stop()
                // Next stream must always be called first
                maybeTearDownNextStream()
                maybeTearDownActiveStream()
            }
        }
    }

    fun teardown() {
        scope.launch {
            exoplayerLifecycle.maybeTearDownExoPlayer()
        }
    }

    fun next() {
        if (nextStream != null && activeStream != null) {
            scope.launch {
                val exoplayer = exoPlayer

                if (exoplayer != null) {
                    logExoPlayerState("next(); pre-change", exoplayer)
                    exoplayer.seekToNextMediaItem()
                    logExoPlayerState("next(); post-change", exoplayer)
                }
            }
        } else {
            Log.d("relisten-audio", "activeStream=${activeStream?.streamable?.identifier} nextStream=${nextStream?.streamable?.identifier}")
        }
    }

    fun seekTo(percent: Double) {
        if (percent >= 1.0) {
            next()
        }

        val activeStream = activeStream
        val duration = currentDuration
        if (activeStream != null && exoPlayer != null && duration != null) {
            scope.launch {
                exoPlayer?.let {
                    it.seekTo((percent * duration * 1000L).toLong())
                    it.play()
                }
            }
        }
    }

    fun seekToTime(timeMs: Long) {
        val activeStream = activeStream
        val duration = currentDuration
        if (activeStream != null && exoPlayer != null && duration != null) {
            if (timeMs >= duration * 1000) {
                next()
            }

            scope.launch {
                exoPlayer?.let {
                    it.seekTo(timeMs)
                    it.play()
                }
            }
        }
    }

    fun prepareAudioSession() {
        // What does this mean on Android? MediaSession APIs?
    }

    fun play(streamable: RelistenGaplessStreamable) {
        play(streamable, startingAtMs = null)
    }

    internal fun logExoPlayerState(prefix: String, exoplayer: Player) {
        var queueStr = ""

        for (i in 0..<exoplayer.mediaItemCount) {
            val mediaItem = exoplayer.getMediaItemAt(i)
            queueStr += "\n$i${if (i == exoplayer.currentMediaItemIndex) "*" else ""}: ${mediaItem.mediaId} ${mediaItem.mediaMetadata.title}"
        }

        Log.d("relisten-audio", "$prefix; mediaItemCount=${exoplayer.mediaItemCount}, playbackState=${exoplayer.playbackState}, queue:$queueStr")
    }

    internal fun playStreamableImmediately(streamable: RelistenGaplessStreamable, startingAtMs: Long? = null) {

        val activeStream = streamManagement.buildStream(streamable)
        this.activeStream = activeStream

        scope.launch {
            val exoplayer = exoplayerLifecycle.maybeSetupExoPlayer()

            var previousNext: MediaItem? = null

            logExoPlayerState("playStreamableImmediately(); pre-change", exoplayer)

            if (exoplayer.currentMediaItemIndex + 1 < exoplayer.mediaItemCount) {
                previousNext = exoplayer.getMediaItemAt(exoplayer.currentMediaItemIndex + 1)
            }

            if (startingAtMs != null) {
                exoplayer.setMediaItem(activeStream.mediaItem, startingAtMs)
            }
            else {
                exoplayer.setMediaItem(activeStream.mediaItem)
            }

            exoplayer.prepare()
            exoplayer.play()

            if (previousNext != null) {
                Log.d("relisten-audio", "playStreamableImmediately(); reinserting previousNext MediaItem mediaId=${previousNext.mediaId}")
                exoplayer.addMediaItem(previousNext)
            }

            logExoPlayerState("playStreamableImmediately(); post-change", exoplayer)

            playbackUpdates.startUpdates()
        }
    }
}
