package net.relisten.android.audio_player

import androidx.media3.common.C
import androidx.media3.common.Timeline
import androidx.media3.exoplayer.source.MediaSource.MediaPeriodId
import androidx.media3.exoplayer.source.TrackGroupArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RelistenLoadControlTest {
    private val periodId = MediaPeriodId(Any())
    private val loadControl = RelistenLoadControl().apply {
        onPrepared()
        onTracksSelected(Timeline.EMPTY, periodId, emptyArray(), TrackGroupArray.EMPTY, emptyArray())
    }

    @Test
    fun stopsAtTwoMinutesAndRefillsBelowOneMinute() {
        assertTrue(continueLoading(0))
        assertTrue(continueLoading(119_999))
        assertFalse(continueLoading(120_000))
        assertFalse(continueLoading(90_000))
        assertFalse(continueLoading(60_000))
        assertTrue(continueLoading(59_999))
        assertTrue(continueLoading(90_000))
    }

    @Test
    fun byteTargetStopsLoadingEvenBelowMinimumDuration() {
        val allocator = loadControl.allocator
        val allocations = List(8 * 1024 * 1024 / allocator.individualAllocationLength - 1) {
            allocator.allocate()
        }
        assertTrue(continueLoading(5_000))

        val finalAllocation = allocator.allocate()
        assertEquals(8 * 1024 * 1024, allocator.totalBytesAllocated)
        assertFalse(continueLoading(5_000))

        allocator.release(finalAllocation)
        assertTrue(continueLoading(5_000))
        allocations.forEach { allocator.release(it) }
    }

    @Test
    fun preservesStartupSeekAndRebufferThresholds() {
        assertFalse(startPlayback(2_499, rebuffering = false))
        assertTrue(startPlayback(2_500, rebuffering = false))
        assertFalse(startPlayback(4_999, rebuffering = true))
        assertTrue(startPlayback(5_000, rebuffering = true))
        assertEquals(0L, loadControl.backBufferDurationUs)
        assertFalse(loadControl.retainBackBufferFromKeyframe())
    }

    private fun continueLoading(bufferedMs: Long): Boolean =
        loadControl.shouldContinueLoading(0, bufferedMs * 1_000, 1f)

    private fun startPlayback(bufferedMs: Long, rebuffering: Boolean): Boolean =
        loadControl.shouldStartPlayback(
            Timeline.EMPTY, periodId, bufferedMs * 1_000, 1f, rebuffering, C.TIME_UNSET
        )
}
