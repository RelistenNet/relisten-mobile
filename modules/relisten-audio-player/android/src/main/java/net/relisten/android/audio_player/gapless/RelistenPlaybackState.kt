package net.relisten.android.audio_player.gapless

import androidx.media3.common.Player

enum class RelistenPlaybackState {
    Stopped, Playing, Paused, Stalled,
}

internal fun relistenPlaybackStateFromPlaybackState(playbackState: @Player.State Int) = when (playbackState) {
    Player.STATE_IDLE -> RelistenPlaybackState.Paused
    Player.STATE_ENDED -> RelistenPlaybackState.Stopped
    Player.STATE_READY -> RelistenPlaybackState.Playing
    Player.STATE_BUFFERING -> RelistenPlaybackState.Stalled
    else -> {
        RelistenPlaybackState.Stopped
    }
}