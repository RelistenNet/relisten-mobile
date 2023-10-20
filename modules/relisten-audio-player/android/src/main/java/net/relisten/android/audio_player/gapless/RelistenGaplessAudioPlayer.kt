package net.relisten.android.audio_player.gapless

import android.util.Log
import com.un4seen.bass.BASS
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import net.relisten.android.audio_player.gapless.internal.BASSLifecycle
import net.relisten.android.audio_player.gapless.internal.RelistenMediaSession
import net.relisten.android.audio_player.gapless.internal.Playback
import net.relisten.android.audio_player.gapless.internal.PlaybackUpdates
import net.relisten.android.audio_player.gapless.internal.StreamManagement

class RelistenGaplessAudioPlayer {
    var delegate: RelistenGaplessAudioPlayerDelegate? = null

    internal var isSetup: Boolean = false

    internal var mixerMainStream: Int? = null
    internal var activeStream: RelistenGaplessAudioStream? = null
    internal var nextStream: RelistenGaplessAudioStream? = null

    internal val scope = CoroutineScope(Dispatchers.IO)

    internal val bassLifecycle = BASSLifecycle(this)
    internal val streamManagement = StreamManagement(this)
    internal val playbackUpdates = PlaybackUpdates(this)
    internal val playback = Playback(this)
    internal val mediaSession = RelistenMediaSession(this)

    companion object {
        // Values from https://github.com/einsteinx2/iSubMusicStreamer/blob/master/Classes/Audio%20Engine/Bass.swift

        // TODO: decide best value for this
        // 250ms (also used for BASS_CONFIG_UPDATEPERIOD, so total latency is 500ms)
        internal var outputBufferSize: Int = 250

        // TODO: 48Khz is the default hardware sample rate of the iPhone,
        //       but since most released music is 44.1KHz, need to confirm if it's better
        //       to let BASS to the upsampling, or let the DAC do it...
        internal var outputSampleRate: Int = 44100
    }

    val currentDuration: Double?
        get() {
            val activeStream = activeStream

            if (!isSetup || activeStream == null) {
                return null
            }

            val len = BASS.BASS_ChannelGetLength(activeStream.stream, BASS.BASS_POS_BYTE)

            if (len == -1L) {
                return null
            }

            return BASS.BASS_ChannelBytes2Seconds(
                    activeStream.stream,
                    len + activeStream.channelOffset
            )
        }

    val elapsed: Double?
        get() {
            val activeStream = activeStream

            if (!isSetup || activeStream == null) {
                return null
            }

            val elapsedBytes =
                    BASS.BASS_ChannelGetPosition(activeStream.stream, BASS.BASS_POS_BYTE)

            if (elapsedBytes == -1L) {
                return null
            }

            return BASS.BASS_ChannelBytes2Seconds(
                    activeStream.stream,
                    elapsedBytes + activeStream.channelOffset
            )
        }

    val activeTrackDownloadedBytes: Long?
        get() {
            val activeStream = activeStream

            if (!isSetup || activeStream == null) {
                return null
            }

            val downloadedBytes =
                    BASS.BASS_StreamGetFilePosition(activeStream.stream, BASS.BASS_FILEPOS_DOWNLOAD)

            return downloadedBytes
        }

    val activeTrackTotalBytes: Long?
        get() {
            val activeStream = activeStream

            if (!isSetup || activeStream == null) {
                return null
            }

            val totalFileBytes =
                    BASS.BASS_StreamGetFilePosition(activeStream.stream, BASS.BASS_FILEPOS_SIZE)

            return totalFileBytes
        }

    var volume: Float
        get() {
            if (!isSetup) {
                return 0.0f
            }

            return BASS.BASS_GetVolume()
        }
        set(newValue) {
            if (!isSetup) {
                return
            }

            BASS.BASS_SetVolume(newValue)
        }

    internal var _currentState: RelistenPlaybackState? = null
    var currentState: RelistenPlaybackState
        get() {
            val mixerMainStream = mixerMainStream

            if (mixerMainStream == null) {
                return RelistenPlaybackState.Stopped
            }


            val newState =
                    RelistenPlaybackStateForBASSPlaybackState(BASS.BASS_ChannelIsActive(mixerMainStream))
            _currentState = newState
            return newState
        }
        set(newValue) {
            _currentState = newValue

            delegate?.playbackStateChanged(this@RelistenGaplessAudioPlayer, newValue)
        }

    fun play(streamable: RelistenGaplessStreamable, startingAt: Double = 0.0) {
        mediaSession.setupAudioSession(shouldActivate = true)

        val activeStream = activeStream
        val nextStream = nextStream

        if (activeStream != null && nextStream != null && activeStream.streamable.identifier == nextStream.streamable.identifier) {
            next()
        }

        playback.playStreamableImmediately(streamable)
    }

    private fun maybeTearDownNextStream() {
        if (nextStream != null) {
            bassLifecycle.tearDownStream(nextStream!!.stream)
            nextStream = null
        }
    }

    private fun maybeTearDownActiveStream() {
        if (activeStream != null) {
            bassLifecycle.tearDownStream(activeStream!!.stream)
            activeStream = null
        }
    }

    fun setNextStream(streamable: RelistenGaplessStreamable?) {
        bassLifecycle.maybeSetupBASS()

        if (streamable == null) {
            maybeTearDownNextStream()

            return
        }

        if (nextStream?.streamable?.identifier == streamable.identifier) {
            return
        }

        maybeTearDownNextStream()

        nextStream = streamManagement.buildStream(streamable)

        if (activeStream?.preloadFinished == true) {
            streamManagement.startPreloadingNextStream()
        }
    }

    fun resume() {
        bassLifecycle.maybeSetupBASS()

        if (BASS.BASS_Start()) {
            currentState = RelistenPlaybackState.Playing
        }
    }

    fun pause() {
        bassLifecycle.maybeSetupBASS()

        if (BASS.BASS_Pause()) {
            currentState = RelistenPlaybackState.Paused
        }
    }

    fun stop() {
        bassLifecycle.maybeSetupBASS()

        val mixerMainStream = mixerMainStream

        if (mixerMainStream != null) {
            BASS.BASS_ChannelStop(mixerMainStream)

            delegate?.trackChanged(this, activeStream?.streamable, null)
            currentState = RelistenPlaybackState.Stopped

            maybeTearDownActiveStream()
            maybeTearDownNextStream()
        }
    }

    fun teardown() {
        bassLifecycle.maybeTearDownBASS()
    }

    fun next() {
        bassLifecycle.maybeSetupBASS()

        val activeStream = activeStream

        if (nextStream != null && activeStream != null) {
            bassLifecycle.mixInNextStream(completedStream = activeStream.stream)
        }
    }

    fun seekTo(percent: Double) {
        if (percent >= 1.0) {
            next()
        }

        playback.seekToPercent(percent)
    }

    fun prepareAudioSession() {
        // What does this mean on Android? MediaSession APIs?
        mediaSession.setupAudioSession(shouldActivate = true)
    }

    fun play(streamable: RelistenGaplessStreamable) {
        playback.playStreamableImmediately(streamable)
    }

    internal fun bass_assert(tag: String, x: Boolean) {
        if (!x) {
            Log.e("relisten-audio-player", "[bass] assertion failed: ${tag}. BASS.BASS_ErrorGetCode()=${BASS.BASS_ErrorGetCode()}")
        }
    }
}