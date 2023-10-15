package net.relisten.android.audio_player.gapless.internal

import android.util.Log
import com.un4seen.bass.BASS
import com.un4seen.bass.BASSmix
import kotlinx.coroutines.launch
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayer
import net.relisten.android.audio_player.gapless.RelistenPlaybackState

class BASSLifecycle internal constructor(private val player: RelistenGaplessAudioPlayer) : BASS.SYNCPROC {
    companion object {
        internal val SYNC_END_SENTINEL = Object()
        internal val SYNC_DOWNLOAD_SENTINEL = Object()
        internal val SYNC_STALL_SENTINEL = Object()
    }

    internal fun maybeSetupBASS() {
        if (player.isSetup) {
            return
        }

        BASS.BASS_SetConfig(BASS.BASS_CONFIG_NET_TIMEOUT, 15 * 1000)

        // Use 2 threads
        BASS.BASS_SetConfig(BASS.BASS_CONFIG_UPDATETHREADS, 2)
        // Lower the update period to reduce latency
        BASS.BASS_SetConfig(
            BASS.BASS_CONFIG_UPDATEPERIOD,
            RelistenGaplessAudioPlayer.outputBufferSize
        )
        // Set the buffer length to the minimum amount + outputBufferSize
        BASS.BASS_SetConfig(
            BASS.BASS_CONFIG_BUFFER,
            BASS.BASS_GetConfig(BASS.BASS_CONFIG_UPDATEPERIOD) + RelistenGaplessAudioPlayer.outputBufferSize
        )
        // Set DSP effects to use floating point math to avoid clipping within the effects chain
        BASS.BASS_SetConfig(BASS.BASS_CONFIG_FLOATDSP, 1)

        player.bass_assert(BASS.BASS_Init(-1, 44100, 0))

        player.mixerMainStream = BASSmix.BASS_Mixer_StreamCreate(44100, 2, BASSmix.BASS_MIXER_END)

        BASS.BASS_ChannelSetSync(
            player.mixerMainStream!!,
            BASS.BASS_SYNC_END or BASS.BASS_SYNC_MIXTIME,
            0,
            this,
            BASSLifecycle.SYNC_END_SENTINEL
        )
    }

    internal fun maybeTearDownBASS() {
        if (!player.isSetup) {
            return
        }

        player.isSetup = false

        val activeStream = player.activeStream
        val nextStream = player.nextStream

        if (activeStream != null) {
            tearDownStream(activeStream.stream)
            player.activeStream = null
        }

        if (nextStream != null) {
            tearDownStream(nextStream.stream)
            player.nextStream = null
        }

        BASS.BASS_Free()
    }

    internal fun tearDownStream(stream: Int) {
        Log.i("relisten-audio-player", "[bass][stream] tearing down stream $stream")

        // stop channels to allow them to be freed
        BASS.BASS_ChannelStop(stream)

        // remove this stream from the mixer
        // not assert'd because sometimes it should fail (i.e. hasn't been added to the mixer yet)
        BASSmix.BASS_Mixer_ChannelRemove(stream)

        BASS.BASS_StreamFree(stream)
    }

    internal fun mixInNextStream(completedStream: Int) {
        val mixerMainStream = player.mixerMainStream ?: return

        val previousStream = player.activeStream
        val nextStream = player.nextStream

        if (nextStream != null) {
            Log.i("relisten-audio-player", "[bass][stream] mixing in next stream with norampin")
            player.bass_assert(
                BASSmix.BASS_Mixer_StreamAddChannel(
                    mixerMainStream,
                    nextStream.stream,
                    BASS.BASS_STREAM_AUTOFREE or BASSmix.BASS_MIXER_NORAMPIN
                )
            )
            player.bass_assert(BASS.BASS_ChannelSetPosition(mixerMainStream, 0, BASS.BASS_POS_BYTE))

            // We cannot tear down yet because at mix time we've reached the end, the audio is still being used.
            // BASS_STREAM_AUTOFREE will automatically free the stream once it finishes playing.

            player.activeStream = nextStream
            player.nextStream = null

            // this is needed because the stream download events don't fire for local music
            // TODO: confirm it works this way on Android
            if (nextStream.streamable.isFileUrl()) {
                streamDownloadComplete(nextStream.stream)
            }
        } else {
            if (BASS.BASS_ChannelStop(mixerMainStream)) {
                BASS.BASS_Stop()
                player.currentState = RelistenPlaybackState.Stopped

                if (player.activeStream != null) {
                    tearDownStream(player.activeStream!!.stream)
                    player.activeStream = null
                }
            }
        }

        if (previousStream != null) {
            player.scope.launch {
                player.delegate?.trackChanged(
                    player,
                    previousStreamable = previousStream.streamable,
                    currentStreamable = player.activeStream?.streamable
                )
            }
        }
    }

    internal fun streamDownloadComplete(stream: Int) {
        Log.i("relisten-audio-player", "[bass][stream] stream download complete: $stream")

        val activeStream = player.activeStream
        val nextStream = player.nextStream

        if (activeStream != null && stream == activeStream.stream) {
            if (!activeStream.preloadFinished) {
                activeStream.preloadFinished = true

                player.streamManagement.startPreloadingNextStream()
            }
        } else if (nextStream != null && stream == nextStream.stream) {
            nextStream.preloadStarted = true
            nextStream.preloadFinished = true

            // the inactive stream is also loaded--good, but we don't want to load anything else
            // we do want to start decoding the downloaded data though

            // The amount of data to render, in milliseconds... 0 = default (2 x update period)
            // bass_assert(BASS_ChannelUpdate(inactiveStream, 0));
        } else {
            Log.i("relisten-audio-player", "[bass][ERROR] whoa, unknown stream finished downloading: $stream")
        }
    }

    internal fun streamStalled(stream: Int) {
        if (stream == player.activeStream?.stream) {
            Log.i("relisten-audio-player", "[bass][stream] stream stalled: $stream)")
            player.currentState = RelistenPlaybackState.Stalled
        }
    }

    internal fun streamResumedAfterStall(stream: Int) {
        if (stream == player.activeStream?.stream) {
            Log.i("relisten-audio-player", "[bass][stream] stream resumed after stall: $stream)")
            player.currentState = RelistenPlaybackState.Playing
        }
    }

    override fun SYNCPROC(handle: Int, channel: Int, data: Int, user: Any?) {
        player.scope.launch {
            if (user == BASSLifecycle.SYNC_END_SENTINEL) {
                Log.i("relisten-audio-player", "[base][stream] mixer end sync: $player handle=$handle channel=$channel")
                mixInNextStream(completedStream = channel)
            }
            else if (user == BASSLifecycle.SYNC_STALL_SENTINEL) {
                Log.i("relisten-audio-player", "[base][stream] stream stall: $player handle=$handle channel=$channel data=$data")
                if (data == 0 /* stalled */) {
                    streamStalled(channel)
                } else if (data == 1 /* resumed */) {
                    streamResumedAfterStall(channel)
                }
            }
            else if (user == BASSLifecycle.SYNC_DOWNLOAD_SENTINEL) {
                Log.i("relisten-audio-player", "[base][stream] stream download completed: $player handle=$handle channel=$channel")
                streamDownloadComplete(channel)
            }
        }
    }
}

class BASSException(val code: Int, message: String): Exception(message)

fun ErrorForErrorCode(erro: Int): BASSException {
    var str = "Unknown error"

    if (erro == BASS.BASS_ERROR_INIT) {
        str = "BASS_ERROR_INIT: BASS_Init has not been successfully called."
    } else if (erro == BASS.BASS_ERROR_NOTAVAIL) {
        str =
            "BASS_ERROR_NOTAVAIL: Only decoding channels (BASS_STREAM_DECODE) are allowed when using the \"no sound\" device. The BASS_STREAM_AUTOFREE flag is also unavailable to decoding channels."
    } else if (erro == BASS.BASS_ERROR_NONET) {
        str =
            "BASS_ERROR_NONET: No internet connection could be opened. Can be caused by a bad proxy setting."
    } else if (erro == BASS.BASS_ERROR_ILLPARAM) {
        str = "BASS_ERROR_ILLPARAM: url is not a valid URL."
    } else if (erro == BASS.BASS_ERROR_SSL) {
        str = "BASS_ERROR_SSL: SSL/HTTPS support is not available."
    } else if (erro == BASS.BASS_ERROR_TIMEOUT) {
        str =
            "BASS_ERROR_TIMEOUT: The server did not respond to the request within the timeout period, as set with the BASS_CONFIG_NET_TIMEOUT config option."
    } else if (erro == BASS.BASS_ERROR_FILEOPEN) {
        str = "BASS_ERROR_FILEOPEN: The file could not be opened."
    } else if (erro == BASS.BASS_ERROR_FILEFORM) {
        str = "BASS_ERROR_FILEFORM: The file's format is not recognised/supported."
    } else if (erro == BASS.BASS_ERROR_CODEC) {
        str =
            "BASS_ERROR_CODEC: The file uses a codec that is not available/supported. This can apply to WAV and AIFF files, and also MP3 files when using the \"MP3-free\" BASS version."
    } else if (erro == BASS.BASS_ERROR_SPEAKER) {
        str =
            "BASS_ERROR_SPEAKER: The sample format is not supported by the device/drivers. If the stream is more than stereo or the BASS_SAMPLE_FLOAT flag is used, it could be that they are not supported."
    } else if (erro == BASS.BASS_ERROR_MEM) {
        str = "BASS_ERROR_MEM: There is insufficient memory."
    } else if (erro == BASS.BASS_ERROR_NO3D) {
        str = "BASS_ERROR_NO3D: Could not initialize 3D support."
    } else if (erro == BASS.BASS_ERROR_UNKNOWN) {
        str =
            "BASS_ERROR_UNKNOWN: Some other mystery problem! Usually this is when the Internet is available but the server/port at the specific URL isn't."
    }

    return BASSException(erro, str)
}