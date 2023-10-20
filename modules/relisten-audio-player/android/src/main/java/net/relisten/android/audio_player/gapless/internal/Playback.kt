package net.relisten.android.audio_player.gapless.internal

import android.util.Log
import com.un4seen.bass.BASS
import com.un4seen.bass.BASSmix
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayer
import net.relisten.android.audio_player.gapless.RelistenGaplessStreamable
import net.relisten.android.audio_player.gapless.RelistenPlaybackState
import kotlin.math.floor

class Playback internal constructor(private val player: RelistenGaplessAudioPlayer) {
    fun playStreamableImmediately(streamable: RelistenGaplessStreamable) {
        player.bassLifecycle.maybeSetupBASS()

        val mixerMainStream = player.mixerMainStream

        if (mixerMainStream == null) {
            assert(false) { "mixerMainStream is nil after setting up BASS" }
            return
        }

        // stop playback
        player.bass_assert("BASS_ChannelStop", BASS.BASS_ChannelStop(mixerMainStream))

        var activeStream = player.activeStream

        if (activeStream != null) {
            player.bassLifecycle.tearDownStream(activeStream.stream)
        }

        player.activeStream = player.streamManagement.buildStream(streamable)
        activeStream = player.activeStream

        player.bass_assert("activeStream", activeStream != null);

        if (activeStream != null) {
            player.bass_assert(
                    "BASS_Mixer_StreamAddChannel",
                    BASSmix.BASS_Mixer_StreamAddChannel(
                            mixerMainStream,
                            activeStream.stream,
                            BASS.BASS_STREAM_AUTOFREE or BASSmix.BASS_MIXER_NORAMPIN
                    )
            )

            // Make sure BASS is started, just in case we had paused it earlier
            BASS.BASS_Start()
            Log.i("relisten-audio-player", "[bass][stream] BASS.BASS_Start() called")

            // the TRUE for the second argument clears the buffer so there isn't old sound playing
            player.bass_assert("BASS_ChannelPlay", BASS.BASS_ChannelPlay(mixerMainStream, true))

            player.delegate?.trackChanged(
                    player,
                    previousStreamable = null,
                    currentStreamable = player.activeStream?.streamable
            )

            player.currentState = RelistenPlaybackState.Playing

            // this is needed because the stream download events don't fire for local music
            if (activeStream.streamable.isFileUrl()) {
                // this will call nextTrackChanged and setupInactiveStreamWithNext
                player.bassLifecycle.streamDownloadComplete(activeStream.stream)
            }
        }

        player.playbackUpdates.startUpdates()
    }

    fun seekToPercent(pct: Double) {
        // NOTE: all these calculations use the stream request offset to translate the #s into one's valid
        // for the *entire* track. we must be careful to identify situations where we need to make a new request
        player.bassLifecycle.maybeSetupBASS()

        val activeStream = player.activeStream

        if (activeStream == null) {
            // The user may have tried to seek before the stream has loaded.
            // TODO: Store the desired seek percent and apply it once the stream has loaded
            Log.i("relisten-audio-player", "[bass][stream] Stream hasn't loaded yet. Ignoring seek to $pct.")
            return
        }

        val len = BASS.BASS_ChannelGetLength(
                activeStream.stream,
                BASS.BASS_POS_BYTE
        ) + activeStream.channelOffset
        val duration = BASS.BASS_ChannelBytes2Seconds(activeStream.stream, len)
        val seekTo = BASS.BASS_ChannelSeconds2Bytes(activeStream.stream, duration * pct)
        val seekToDuration = BASS.BASS_ChannelBytes2Seconds(activeStream.stream, seekTo)

        Log.i("relisten-audio-player", "[bass][stream] Found length in bytes to be $len bytes/$duration. Seeking to: $seekTo bytes/$seekToDuration")

        val downloadedBytes = BASS.BASS_StreamGetFilePosition(
                activeStream.stream,
                BASS.BASS_FILEPOS_DOWNLOAD
        ) + activeStream.fileOffset
        val totalFileBytes = BASS.BASS_StreamGetFilePosition(
                activeStream.stream,
                BASS.BASS_FILEPOS_SIZE
        ) + activeStream.fileOffset
        val downloadedPct = 1.0 * downloadedBytes.toDouble() / totalFileBytes.toDouble()

        val seekingBeforeStartOfThisRequest = seekTo < activeStream.channelOffset
        val seekingBeyondDownloaded = pct > downloadedPct

        // seeking before the offset point --> we need to make a new request
        // seeking after the most recently downloaded data --> we need to make a new request
        if (seekingBeforeStartOfThisRequest || seekingBeyondDownloaded) {
            val fileOffset = floor(pct * totalFileBytes.toDouble()).toLong()

            Log.i("relisten-audio-player", "[bass][stream] Seek % ($pct/$fileOffset) is greater than downloaded % ($downloadedPct/$downloadedBytes) OR seek channel byte ($seekTo) < start channel offset (${activeStream.channelOffset}). Opening new stream.")

            val oldActiveStream = activeStream

            val newActiveStream = player.streamManagement.buildStream(
                    activeStream.streamable,
                    fileOffset = fileOffset,
                    channelOffset = seekTo
            )
            player.activeStream = newActiveStream

            val mixerMainStream = player.mixerMainStream

            if (newActiveStream != null && mixerMainStream != null) {
                player.bass_assert(
                        "BASS_Mixer_StreamAddChannel",
                        BASSmix.BASS_Mixer_StreamAddChannel(
                                mixerMainStream,
                                newActiveStream.stream,
                                BASS.BASS_STREAM_AUTOFREE or BASSmix.BASS_MIXER_NORAMPIN
                        )
                )

                BASS.BASS_Start()
                // the TRUE for the second argument clears the buffer to prevent bits of the old playback
                player.bass_assert("BASS_ChannelPlay", BASS.BASS_ChannelPlay(mixerMainStream, true))

                player.bassLifecycle.tearDownStream(oldActiveStream.stream)
            }
        } else {
            player.bass_assert(
                    "BASS_ChannelSetPosition",
                    BASS.BASS_ChannelSetPosition(
                            activeStream.stream,
                            seekTo - activeStream.channelOffset,
                            BASS.BASS_POS_BYTE
                    )
            )
        }
    }
}