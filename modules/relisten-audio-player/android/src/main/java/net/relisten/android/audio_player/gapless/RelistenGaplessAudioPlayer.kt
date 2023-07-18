package net.relisten.android.audio_player.gapless

import com.un4seen.bass.BASS
import com.un4seen.bass.BASSmix
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class RelistenGaplessAudioPlayer {
    private var isSetup: Boolean = false

    private var mixerMainStream: Int? = null
    private var activeStream: RelistenGaplessAudioStream? = null

    private val scope = CoroutineScope(Dispatchers.IO)

    companion object {
        // Values from https://github.com/einsteinx2/iSubMusicStreamer/blob/master/Classes/Audio%20Engine/Bass.swift

        // 250ms (also used for BASS_CONFIG_UPDATEPERIOD, so total latency is 500ms)
        private var outputBufferSize: Int = 250
        private var outputSampleRate: Int = 44100
    }

    private fun maybeSetupBASS() {
        if (isSetup) {
            return
        }

        BASS.BASS_SetConfig(BASS.BASS_CONFIG_NET_TIMEOUT, 15 * 1000)

        // Use 2 threads
        BASS.BASS_SetConfig(BASS.BASS_CONFIG_UPDATETHREADS, 2)
        // Lower the update period to reduce latency
        BASS.BASS_SetConfig(BASS.BASS_CONFIG_UPDATEPERIOD, outputBufferSize)
        // Set the buffer length to the minimum amount + outputBufferSize
        BASS.BASS_SetConfig(BASS.BASS_CONFIG_BUFFER, BASS.BASS_GetConfig(BASS.BASS_CONFIG_UPDATEPERIOD) + outputBufferSize)
        // Set DSP effects to use floating point math to avoid clipping within the effects chain
        BASS.BASS_SetConfig(BASS.BASS_CONFIG_FLOATDSP, 1)

        bass_assert(BASS.BASS_Init(-1, 44100, 0))

        mixerMainStream = BASSmix.BASS_Mixer_StreamCreate(44100, 2, BASSmix.BASS_MIXER_END)
    }

    public fun play(streamable: RelistenGaplessStreamable) {
        scope.launch {
            playStreamableImmediately(streamable)
        }
    }

    private fun playStreamableImmediately(streamable: RelistenGaplessStreamable) {
        maybeSetupBASS()

        assert(mixerMainStream != null)

        val mixerMainStream = mixerMainStream!!

        // stop playback
        bass_assert(BASS.BASS_ChannelStop(mixerMainStream))

        if (activeStream != null) {
//            tearDownStream(activeStream!!.stream)
        }

        activeStream = buildStream(streamable)

        if (activeStream != null) {
            val activeStream = activeStream!!

            bass_assert(BASSmix.BASS_Mixer_StreamAddChannel(mixerMainStream,
                    activeStream.stream,
                    BASS.BASS_STREAM_AUTOFREE or BASSmix.BASS_MIXER_NORAMPIN))

            // Make sure BASS is started, just in case we had paused it earlier
            BASS.BASS_Start()
            print("[bass][stream] BASS.BASS_Start() called")

            // the TRUE for the second argument clears the buffer so there isn't old sound playing
            bass_assert(BASS.BASS_ChannelPlay(mixerMainStream, true))

//            currentState = Playing

            // this is needed because the stream download events don't fire for local music
//                    if activeStream.streamable.url.isFileURL {
//                        // this will call nextTrackChanged and setupInactiveStreamWithNext
//                        streamDownloadComplete(activeStream.stream)
//                    }
        } else {
            assert(false) { "activeStream nil after buildingStream from $streamable" }
        }

//        startUpdates()
    }

    private fun buildStream(streamable: RelistenGaplessStreamable, fileOffset: Int = 0, channelOffset: Int = 0): RelistenGaplessAudioStream? {
        maybeSetupBASS()

        val newStream = if (streamable.url.protocol == "file") {
            BASS.BASS_StreamCreateFile(
                    streamable.url.path,
                    fileOffset.toLong(),
                    0,
                    BASS.BASS_STREAM_DECODE or BASS.BASS_SAMPLE_FLOAT or BASS.BASS_ASYNCFILE or BASS.BASS_STREAM_PRESCAN)
        } else {
            BASS.BASS_StreamCreateURL(streamable.url.toString(),
                    fileOffset,
                    BASS.BASS_STREAM_DECODE or BASS.BASS_SAMPLE_FLOAT,
                    null, // StreamDownloadProc,
                    null) // (__bridge void *)(self));
        }

        if (newStream == 0) {
            val code = BASS.BASS_ErrorGetCode()
            println("[bass][stream] error creating new stream: $code")

            return null
        }

        println("[bass][stream] created new stream: $newStream. identifier=${streamable.identifier}")

        return RelistenGaplessAudioStream(streamable, newStream)
    }

    private fun bass_assert(x: Boolean) {
        if (!x) {
            println("[bass] assertion failed: ${x}")
        }
    }
}