import Foundation

struct NowPlayingElapsedWriteAnchor: Equatable {
    let elapsed: TimeInterval
    let uptime: TimeInterval
    let rate: Float
}

struct NowPlayingElapsedWritePolicy {
    let interval: TimeInterval
    let discontinuityThreshold: TimeInterval
    let pausedElapsedChangeThreshold: TimeInterval

    init(
        interval: TimeInterval,
        discontinuityThreshold: TimeInterval = 1,
        pausedElapsedChangeThreshold: TimeInterval = 0.05
    ) {
        self.interval = interval
        self.discontinuityThreshold = discontinuityThreshold
        self.pausedElapsedChangeThreshold = pausedElapsedChangeThreshold
    }

    func anchor(elapsed: TimeInterval?, rate: Float, now: TimeInterval) -> NowPlayingElapsedWriteAnchor? {
        guard let elapsed else { return nil }
        return NowPlayingElapsedWriteAnchor(elapsed: elapsed, uptime: now, rate: rate)
    }

    func shouldWrite(
        elapsed: TimeInterval?,
        rate: Float,
        latestAnchor: NowPlayingElapsedWriteAnchor?,
        now: TimeInterval
    ) -> Bool {
        guard let elapsed else { return false }
        guard let latestAnchor else { return true }
        guard latestAnchor.rate == rate else { return true }

        if rate == 0 {
            return abs(elapsed - latestAnchor.elapsed) > pausedElapsedChangeThreshold
        }

        let elapsedSinceAnchor = max(0, now - latestAnchor.uptime)
        let expectedElapsed = latestAnchor.elapsed + elapsedSinceAnchor * Double(latestAnchor.rate)

        if abs(elapsed - expectedElapsed) > discontinuityThreshold {
            return true
        }

        return elapsedSinceAnchor >= interval
    }
}
