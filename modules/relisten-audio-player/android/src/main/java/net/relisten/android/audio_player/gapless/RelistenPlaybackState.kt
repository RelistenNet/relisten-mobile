package net.relisten.android.audio_player.gapless

import com.un4seen.bass.BASS
import com.un4seen.bass.BASSmix

enum class RelistenPlaybackState {
    Stopped, Playing, Paused, Stalled,
}

fun RelistenPlaybackStateForBASSPlaybackState(state: Int): RelistenPlaybackState {
    if (state == BASS.BASS_ACTIVE_STOPPED) {
        return RelistenPlaybackState.Stopped
    } else if (state == BASS.BASS_ACTIVE_PLAYING) {
        return RelistenPlaybackState.Playing
    } else if (state == BASS.BASS_ACTIVE_PAUSED || state == BASS.BASS_ACTIVE_PAUSED_DEVICE) {
        return RelistenPlaybackState.Paused
    } else if (state == BASS.BASS_ACTIVE_STALLED || state == BASSmix.BASS_ACTIVE_WAITING || state == BASSmix.BASS_ACTIVE_QUEUED) {
        return RelistenPlaybackState.Stalled
    }

    assert(false) { "Unknown BASS playback state $state" }
    return RelistenPlaybackState.Stopped
}