package net.relisten.android.audio_player

import androidx.media3.common.C
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.upstream.DefaultAllocator

private const val MIN_BUFFER_MS = 60_000
private const val MAX_BUFFER_MS = 120_000
private const val TARGET_BUFFER_BYTES = 8 * 1024 * 1024

internal class RelistenLoadControl : DefaultLoadControl(
    DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE),
    // Keep a network-outage reserve without buffering hours of compressed audio in RAM.
    // Two minutes of 320 kbps MP3 is about 4.8 MB, leaving room below the 8 MiB target.
    MIN_BUFFER_MS,
    MAX_BUFFER_MS,
    DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,
    DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
    // This is a loading threshold for sample allocations, not a hard total-memory limit.
    TARGET_BUFFER_BYTES,
    // Honor the byte target even below MIN_BUFFER_MS (e.g. unusually large samples).
    false,
    DefaultLoadControl.DEFAULT_BACK_BUFFER_DURATION_MS,
    DefaultLoadControl.DEFAULT_RETAIN_BACK_BUFFER_FROM_KEYFRAME
)
