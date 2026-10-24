package net.relisten.android.audio_player.gapless.internal

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackCheckpointPolicyTest {
    @Test fun finalCommitsBypassThrottleButOlderAndDuplicateWritesCannotReplaceThem() {
        val policy = PlaybackCheckpointPolicy()
        assertTrue(policy.shouldWrite(1, "A:120", 0, false))
        policy.committed(1, "A:120", 0)
        assertFalse(policy.shouldWrite(2, "A:121", 1000, false))
        assertTrue(policy.shouldWrite(3, "B:0:paused", 1001, true))
        policy.committed(3, "B:0:paused", 1001)
        assertFalse(policy.shouldWrite(2, "A:121", 2000, true))
        assertFalse(policy.shouldWrite(4, "B:0:paused", 2000, true))
        assertTrue(policy.shouldWrite(4, "B:1:paused", 2000, true))
    }

    @Test fun continuousProgressHasAFixedDeadlineAndFailedWritesCanRetry() {
        val policy = PlaybackCheckpointPolicy()
        policy.committed(1, "A:0", 0)
        for (second in 1L..4L) assertFalse(policy.shouldWrite(second + 1, "A:$second", second * 1000, false))
        assertTrue(policy.shouldWrite(6, "A:5", 5000, false))
        // No committed call means the write failed; no new throttle window begins.
        assertTrue(policy.shouldWrite(7, "A:6", 6000, false))
        policy.committed(7, "A:6", 6000)
        assertFalse(policy.shouldWrite(8, "A:7", 7000, false))
    }
}
