package net.relisten.android.audio_player.gapless.internal

import android.util.Log
import com.un4seen.bass.BASS
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayer
import kotlin.math.floor

class PlaybackUpdates internal constructor(private val player: RelistenGaplessAudioPlayer) {
    internal fun startUpdates() {
        val activeStream = player.activeStream

        if ((activeStream == null)) {
            return
        }

        val oldElapsed = player.elapsed ?: 0.0
        val oldDuration = player.currentDuration ?: 0.0
        val prevState = player._currentState

        val oldDownloadedBytes =
            BASS.BASS_StreamGetFilePosition(activeStream.stream, BASS.BASS_FILEPOS_DOWNLOAD)
        val oldTotalFileBytes =
            BASS.BASS_StreamGetFilePosition(activeStream.stream, BASS.BASS_FILEPOS_SIZE)

        player.scope.launch {
            delay(100L)

            val activeStream = player.activeStream

            if ((activeStream == null)) {
                return@launch
            }

            val thisElapsed = player.elapsed
            val thisDuration = player.currentDuration

            val downloadedBytes =
                BASS.BASS_StreamGetFilePosition(activeStream.stream, BASS.BASS_FILEPOS_DOWNLOAD)
            val totalFileBytes =
                BASS.BASS_StreamGetFilePosition(activeStream.stream, BASS.BASS_FILEPOS_SIZE)

            var sendPlaybackChanged = false
            var sendDownloadChanged = false
            var sendStateChanged = false

            if (thisElapsed == null || floor(oldElapsed) != floor(
                    thisElapsed ?: 0.0
                ) || oldDuration != thisDuration
            ) {
                sendPlaybackChanged = true
            }

            val oldKilobytes = floor(oldDownloadedBytes.toDouble() / (100 * 1024))
            val newKilobytes = floor(downloadedBytes.toDouble() / (100 * 1024))

            // Only update once per 100 KiB
            if (
                (downloadedBytes != -1L && totalFileBytes != -1L && oldTotalFileBytes != -1L && oldDownloadedBytes != -1L)
                &&
                (oldKilobytes != newKilobytes || oldTotalFileBytes != totalFileBytes)
            ) {
                sendDownloadChanged = true
            }

            val thisState = player.currentState

            if (prevState != player.currentState) {
                sendStateChanged = true
            }

            if (sendPlaybackChanged) {
                Log.i("relisten-audio-player", "[playback updates] sendPlaybackChanged")
                player.delegate?.playbackProgressChanged(
                    player, elapsed=thisElapsed, duration=thisDuration
                )
            }

            if (sendDownloadChanged) {
                Log.i("relisten-audio-player", "[playback updates] sendDownloadChanged")
                player.delegate?.downloadProgressChanged(
                    player,
                    forActiveTrack=true, downloadedBytes=downloadedBytes, totalBytes=totalFileBytes)
            }

            if (sendStateChanged) {
                Log.i("relisten-audio-player", "[playback updates] sendStateChanged")
                player.delegate?.playbackStateChanged(player, newPlaybackState=thisState)
            }

            startUpdates()
        }
    }
}