package net.relisten.android.audio_player

import androidx.media3.common.C
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.upstream.DefaultAllocator

internal class RelistenLoadControl : DefaultLoadControl(
    DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE),
    // Match the iOS cache-friendly buffering policy for long live recordings.
    1_000 * 60 * 60 * 2,
    1_000 * 60 * 60 * 2,
    DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,
    DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
    DefaultLoadControl.DEFAULT_TARGET_BUFFER_BYTES,
    true,
    DefaultLoadControl.DEFAULT_BACK_BUFFER_DURATION_MS,
    DefaultLoadControl.DEFAULT_RETAIN_BACK_BUFFER_FROM_KEYFRAME
)
