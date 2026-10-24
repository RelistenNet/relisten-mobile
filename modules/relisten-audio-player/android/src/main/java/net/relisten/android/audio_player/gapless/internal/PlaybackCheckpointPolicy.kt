package net.relisten.android.audio_player.gapless.internal

/** Commit bookkeeping changes only after a successful atomic preferences write. */
internal class PlaybackCheckpointPolicy {
    private var sequence = -1L
    private var fingerprint: String? = null
    private var writtenAt = -5000L

    fun shouldWrite(nextSequence: Long, nextFingerprint: String, now: Long, final: Boolean): Boolean =
        nextSequence > sequence && nextFingerprint != fingerprint && (final || now - writtenAt >= 5000)

    fun committed(nextSequence: Long, nextFingerprint: String, now: Long) {
        sequence = nextSequence
        fingerprint = nextFingerprint
        writtenAt = now
    }
}
