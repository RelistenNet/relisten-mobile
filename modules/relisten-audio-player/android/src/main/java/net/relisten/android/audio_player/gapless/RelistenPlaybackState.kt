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

internal fun relistenPlaybackStateFromPlayer(player: Player) = when {
    player.playbackState == Player.STATE_ENDED -> RelistenPlaybackState.Stopped
    player.playbackState == Player.STATE_BUFFERING -> RelistenPlaybackState.Stalled
    player.playbackState == Player.STATE_READY && player.playWhenReady -> RelistenPlaybackState.Playing
    player.playbackState == Player.STATE_READY -> RelistenPlaybackState.Paused
    player.mediaItemCount == 0 -> RelistenPlaybackState.Stopped
    else -> RelistenPlaybackState.Paused
}
