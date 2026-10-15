package net.relisten.android.audio_player

import androidx.media3.common.C
import androidx.media3.common.Timeline
import androidx.media3.exoplayer.source.MediaSource.MediaPeriodId
import androidx.media3.exoplayer.source.TrackGroupArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private const val MIB = 1024 * 1024

class RelistenLoadControlTest {
    private val periodId = MediaPeriodId(Any())
    private val loadControl = newLoadControl()

    @Test
    fun stopsAtThirtyMinutesAndRefillsBelowFifteenMinutes() {
        assertTrue(continueLoading(loadControl, 0))
        assertTrue(continueLoading(loadControl, 1_799_999))
        assertFalse(continueLoading(loadControl, 1_800_000))
        assertFalse(continueLoading(loadControl, 1_200_000))
        assertFalse(continueLoading(loadControl, 900_000))
        assertTrue(continueLoading(loadControl, 899_999))
        assertTrue(continueLoading(loadControl, 1_200_000))
    }

    @Test
    fun byteBudgetStopsLoadingBelowTimeMinimumEvenOnLargeHeaps() {
        assertByteBudget(newLoadControl(maxHeapMiB = 1024), 32 * MIB)
    }

    @Test
    fun smallerHeapsAndLowRamDevicesUseSmallerByteBudgets() {
        assertByteBudget(newLoadControl(maxHeapMiB = 128), 16 * MIB)
        assertByteBudget(newLoadControl(maxHeapMiB = 256, isLowRamDevice = true), 16 * MIB)
        assertByteBudget(newLoadControl(maxHeapMiB = 64), 8 * MIB)
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

    private fun newLoadControl(
        maxHeapMiB: Int = 256,
        isLowRamDevice: Boolean = false
    ): RelistenLoadControl = RelistenLoadControl(maxHeapMiB.toLong() * MIB, isLowRamDevice).apply {
        onPrepared()
        onTracksSelected(Timeline.EMPTY, periodId, emptyArray(), TrackGroupArray.EMPTY, emptyArray())
    }

    private fun assertByteBudget(control: RelistenLoadControl, expectedBytes: Int) {
        val allocator = control.allocator
        val allocations = List(expectedBytes / allocator.individualAllocationLength - 1) {
            allocator.allocate()
        }
        assertTrue(continueLoading(control, 5_000))

        val finalAllocation = allocator.allocate()
        assertEquals(expectedBytes, allocator.totalBytesAllocated)
        assertFalse(continueLoading(control, 5_000))

        allocator.release(finalAllocation)
        assertTrue(continueLoading(control, 5_000))
        allocations.forEach { allocator.release(it) }
        control.onStopped()
    }

    private fun continueLoading(control: RelistenLoadControl, bufferedMs: Long): Boolean =
        control.shouldContinueLoading(0, bufferedMs * 1_000, 1f)

    private fun startPlayback(bufferedMs: Long, rebuffering: Boolean): Boolean =
        loadControl.shouldStartPlayback(
            Timeline.EMPTY, periodId, bufferedMs * 1_000, 1f, rebuffering, C.TIME_UNSET
        )
}
