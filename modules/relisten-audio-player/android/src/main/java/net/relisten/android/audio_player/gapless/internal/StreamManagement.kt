package net.relisten.android.audio_player.gapless.internal

import android.util.Log
import com.un4seen.bass.BASS
import kotlinx.coroutines.launch
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayer
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioStream
import net.relisten.android.audio_player.gapless.RelistenGaplessStreamable

class StreamManagement internal constructor(private val player: RelistenGaplessAudioPlayer) {
    fun buildStream(
            streamable: RelistenGaplessStreamable, fileOffset: Long = 0, channelOffset: Long = 0
    ): RelistenGaplessAudioStream? {
        player.bassLifecycle.maybeSetupBASS()

        var newStream = 0

        if (streamable.isFileUrl()) {
            newStream = BASS.BASS_StreamCreateFile(
                    streamable.url.path,
                    fileOffset,
                    0L,
                    BASS.BASS_STREAM_DECODE or BASS.BASS_SAMPLE_FLOAT or BASS.BASS_ASYNCFILE or BASS.BASS_STREAM_PRESCAN
            )
        } else {
            newStream = BASS.BASS_StreamCreateURL(
                    streamable.url.toString(),
                    fileOffset.toInt(),
                    BASS.BASS_STREAM_DECODE or BASS.BASS_SAMPLE_FLOAT,
                    null, // StreamDownloadProc,
                    null
            );
        }

        // oops
        if (newStream == 0) {
            val err = ErrorForErrorCode(BASS.BASS_ErrorGetCode())

            Log.e("relisten-audio-player", "[bass][stream] error creating new stream: ${err.code} ${err.message}")

            player.delegate?.errorStartingStream(player, err, streamable)

            return null
        }

        player.bass_assert(
                "BASS_ChannelSetSync",
                BASS.BASS_ChannelSetSync(
                        newStream,
                        BASS.BASS_SYNC_MIXTIME or BASS.BASS_SYNC_DOWNLOAD,
                        0,
                        player.bassLifecycle,
                        null
                ) != 0
        )

        player.bass_assert(
                "BASS_ChannelSetSync",
                BASS.BASS_ChannelSetSync(
                        newStream,
                        BASS.BASS_SYNC_MIXTIME or BASS.BASS_SYNC_STALL,
                        0,
                        player.bassLifecycle,
                        null
                ) != 0
        )

        Log.i("relisten-audio-player", "[bass][stream] created new stream: $newStream. identifier=${streamable.identifier}")

        return RelistenGaplessAudioStream(
                streamable = streamable,
                stream = newStream,
                fileOffset = fileOffset,
                channelOffset = channelOffset
        )
    }

    fun startPreloadingNextStream() {
        val nextStream = player.nextStream

        // don't start loading anything until the active stream has finished
        if (nextStream == null || player.activeStream?.preloadFinished != true) {
            return
        }

        Log.i("relisten-audio-player", "[bass][preloadNextTrack] Preloading next track")

        BASS.BASS_ChannelUpdate(nextStream.stream, 0)
        player.nextStream?.preloadStarted = true
    }
}