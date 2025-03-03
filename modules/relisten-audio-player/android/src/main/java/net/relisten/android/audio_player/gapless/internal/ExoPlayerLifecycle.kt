package net.relisten.android.audio_player.gapless.internal

import android.annotation.SuppressLint
import android.content.ComponentName
import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import net.relisten.android.audio_player.RelistenPlaybackService
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayer
import net.relisten.android.audio_player.gapless.relistenPlaybackStateFromPlaybackState


class ExoPlayerLifecycle internal constructor(private val player: RelistenGaplessAudioPlayer) :
    Player.Listener {
    internal fun maybeSetupExoPlayer(): Player {
        val exoPlayer = player.exoPlayer
        if (exoPlayer != null) {
            return exoPlayer
        }

        return player.exoPlayerFuture.get()
    }

    var controllerFuture: ListenableFuture<MediaController>? = null

    internal fun setupExoPlayer() {
        val appContext = player.reactContext.applicationContext
        val sessionToken =
            SessionToken(appContext, ComponentName(appContext, RelistenPlaybackService::class.java))
        val controllerFuture = MediaController.Builder(appContext, sessionToken)
            .setApplicationLooper(appContext.mainLooper).buildAsync()
        controllerFuture.addListener(
            {
                val mediaController = controllerFuture.get()
                mediaController.addListener(this@ExoPlayerLifecycle)

                player.exoPlayer = mediaController
                player.exoPlayerFuture.complete(mediaController)
            },
            MoreExecutors.directExecutor()
        )

        this.controllerFuture = controllerFuture
    }

    internal fun maybeTearDownExoPlayer() {
        player.activeStream = null
        player.nextStream = null

        player.exoPlayer?.let {
            it.stop()
            it.release()
        }

        player.exoPlayer = null
    }

    override fun onPlaybackStateChanged(playbackState: @Player.State Int) {
        Log.i("relisten-audio-player", "exoplayer.onPlaybackStateChanged: $playbackState")

        player.currentState = relistenPlaybackStateFromPlaybackState(playbackState)
    }

    override fun onPlayerError(error: PlaybackException) {
        Log.e("relisten-audio-player", "exoplayer.onPlayerError: $error")

        val message = arrayOf(
            error.message ?: "No error message",
            error.cause?.message,
            error.cause?.cause?.message
        ).filterNotNull().joinToString(": ")

        player.delegate?.errorStartingStream(
            player,
            RelistenPlaybackException(error.errorCode, error.errorCodeName, message),
            forStreamable = player.activeStream!!.streamable
        )
    }

    override fun onMediaItemTransition(
        mediaItem: MediaItem?,
        reason: @Player.MediaItemTransitionReason Int
    ) {
        Log.i("relisten-audio-player", "exoplayer.onMediaItemTransition: $mediaItem $reason")

        val previousStream = player.activeStream
        val nextStream = player.nextStream

        if (mediaItem == null) {
            player.delegate?.trackChanged(
                player,
                previousStreamable = null,
                currentStreamable = null
            )
        } else if (previousStream?.mediaItem == mediaItem) {
            player.delegate?.trackChanged(
                player,
                previousStreamable = null,
                currentStreamable = previousStream.streamable
            )
        } else if (nextStream?.mediaItem == mediaItem) {
            player.activeStream = nextStream
            player.nextStream = null

            player.exoPlayer?.let {
                it.removeMediaItems(0, it.currentMediaItemIndex)
            }

            player.delegate?.trackChanged(
                player,
                previousStreamable = previousStream?.streamable,
                currentStreamable = nextStream.streamable
            )
        } else {
            Log.e(
                "relisten-audio-player",
                "nextStream.mediaItem ${nextStream?.mediaItem} and previousStream.mediaItem ${previousStream?.mediaItem} doesn't match onMediaItemTransition mediaItem ${mediaItem}"
            )
        }
    }
}

class RelistenPlaybackException(val code: Int, message: String, val description: String) :
    Exception(message)
