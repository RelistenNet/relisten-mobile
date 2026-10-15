package net.relisten.android.audio_player

import androidx.media3.common.C
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.upstream.DefaultAllocator

private const val MIN_BUFFER_MS = 15 * 60_000
private const val MAX_BUFFER_MS = 30 * 60_000
private const val MIB = 1024 * 1024

internal class RelistenLoadControl(
    maxHeapBytes: Long,
    isLowRamDevice: Boolean
) : DefaultLoadControl(
    DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE),
    // Preserve substantial read-ahead for unreliable servers; the byte budget may stop it sooner.
    MIN_BUFFER_MS,
    MAX_BUFFER_MS,
    DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,
    DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
    targetBufferBytes(maxHeapBytes, isLowRamDevice),
    // Enforce the byte budget even before the 15-minute minimum is reached.
    false,
    DefaultLoadControl.DEFAULT_BACK_BUFFER_DURATION_MS,
    DefaultLoadControl.DEFAULT_RETAIN_BACK_BUFFER_FROM_KEYFRAME
)

private fun targetBufferBytes(maxHeapBytes: Long, isLowRamDevice: Boolean): Int {
    // Reserve most of the managed heap for the rest of the app, with a lower ceiling on low-RAM
    // devices. This is a sample-loading threshold, not a hard cap on total player/process memory.
    val ceilingBytes = (if (isLowRamDevice) 16 else 32) * MIB
    return (maxHeapBytes / 8)
        .coerceIn(C.DEFAULT_BUFFER_SEGMENT_SIZE.toLong(), ceilingBytes.toLong())
        .toInt()
}
