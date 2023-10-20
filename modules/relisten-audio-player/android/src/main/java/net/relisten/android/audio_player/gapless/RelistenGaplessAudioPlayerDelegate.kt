package net.relisten.android.audio_player.gapless

import net.relisten.android.audio_player.gapless.internal.BASSException

interface RelistenGaplessAudioPlayerDelegate {
    fun errorStartingStream(
        player: RelistenGaplessAudioPlayer,
        error: BASSException,
        forStreamable: RelistenGaplessStreamable
    )

    fun playbackStateChanged(
        player: RelistenGaplessAudioPlayer,
        newPlaybackState: RelistenPlaybackState
    )

    fun playbackProgressChanged(
        player: RelistenGaplessAudioPlayer,
        elapsed: Double?,
        duration: Double?
    )

    fun downloadProgressChanged(
        player: RelistenGaplessAudioPlayer,
        forActiveTrack: Boolean,
        downloadedBytes: Long,
        totalBytes: Long
    )

    fun trackChanged(
        player: RelistenGaplessAudioPlayer,
        previousStreamable: RelistenGaplessStreamable?,
        currentStreamable: RelistenGaplessStreamable?
    )

    fun audioSessionWasSetup(player: RelistenGaplessAudioPlayer)
}