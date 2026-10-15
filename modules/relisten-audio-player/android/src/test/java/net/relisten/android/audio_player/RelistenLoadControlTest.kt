package net.relisten.android.audio_player

import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.analytics.PlayerId
import androidx.media3.exoplayer.source.MediaSource.MediaPeriodId
import androidx.media3.exoplayer.source.SinglePeriodTimeline
import androidx.media3.exoplayer.source.TrackGroupArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private const val MIB = 1024 * 1024

class RelistenLoadControlTest {
    private val playerId = PlayerId("relisten-test")
    private val timeline = SinglePeriodTimeline(C.TIME_UNSET, true, false, false, null, MediaItem.EMPTY)
    private val periodId = MediaPeriodId(timeline.getUidOfPeriod(0))
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
        assertEquals(0L, loadControl.getBackBufferDurationUs(playerId))
        assertFalse(loadControl.retainBackBufferFromKeyframe(playerId))
    }

    private fun newLoadControl(
        maxHeapMiB: Int = 256,
        isLowRamDevice: Boolean = false
    ): RelistenLoadControl = RelistenLoadControl(maxHeapMiB.toLong() * MIB, isLowRamDevice).apply {
        onPrepared(playerId)
        onTracksSelected(parameters(0), TrackGroupArray.EMPTY, emptyArray())
    }

    private fun assertByteBudget(control: RelistenLoadControl, expectedBytes: Int) {
        val allocator = control.getAllocator(playerId)
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
        control.onStopped(playerId)
    }

    private fun continueLoading(control: RelistenLoadControl, bufferedMs: Long): Boolean =
        control.shouldContinueLoading(parameters(bufferedMs))

    private fun startPlayback(bufferedMs: Long, rebuffering: Boolean): Boolean =
        loadControl.shouldStartPlayback(parameters(bufferedMs, rebuffering))

    private fun parameters(bufferedMs: Long, rebuffering: Boolean = false) = LoadControl.Parameters(
        playerId,
        timeline,
        periodId,
        0,
        bufferedMs * 1_000,
        1f,
        true,
        rebuffering,
        C.TIME_UNSET,
        C.TIME_UNSET
    )
}
