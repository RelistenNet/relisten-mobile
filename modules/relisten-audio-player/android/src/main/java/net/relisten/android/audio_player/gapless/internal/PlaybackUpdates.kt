package net.relisten.android.audio_player.gapless.internal

import android.util.Log
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayer
import kotlin.math.floor

class PlaybackUpdates internal constructor(private val player: RelistenGaplessAudioPlayer) {
    private var startedUpdates = false

    internal fun startUpdates(bypassCheck: Boolean = false) {
        val activeStream = player.activeStream

        if ((activeStream == null)) {
            return
        }

        if (startedUpdates && !bypassCheck) {
            return
        }

        startedUpdates = true

        val oldElapsed = player.elapsed ?: 0.0
        val oldDuration = player.currentDuration ?: 0.0
        val prevState = player._currentState

        val oldBufferedPercentage = player.activeTrackDownloadedBytes ?: 0L

        player.scope.launch {
            delay(100L)

            val activeStream = player.activeStream

            if ((activeStream == null)) {
                return@launch
            }

            val thisElapsed = player.elapsed
            val thisDuration = player.currentDuration

            val bufferedPercentage = player.activeTrackDownloadedBytes ?: 0L

            var sendPlaybackChanged = false
            var sendDownloadChanged = false
            var sendStateChanged = false

            if (thisElapsed == null || floor(oldElapsed) != floor(
                    thisElapsed ?: 0.0
                ) || oldDuration != thisDuration
            ) {
                sendPlaybackChanged = true
            }

            // Only update once per 1%
            if (bufferedPercentage - oldBufferedPercentage >= 1) {
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
                    forActiveTrack=true, downloadedBytes=bufferedPercentage, totalBytes=player.activeTrackTotalBytes ?: 100L)
            }

            if (sendStateChanged) {
                Log.i("relisten-audio-player", "[playback updates] sendStateChanged")
                player.delegate?.playbackStateChanged(player, newPlaybackState=thisState)
            }

            startUpdates(bypassCheck=true)
        }
    }
}