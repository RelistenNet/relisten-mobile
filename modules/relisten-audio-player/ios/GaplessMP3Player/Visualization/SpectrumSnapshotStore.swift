import Foundation
import os

struct SpectrumSnapshot: Sendable {
    let bands: [Float]
    let capturedAt: TimeInterval

    static let flat = SpectrumSnapshot(
        bands: SpectrumBandAnalyzer.flatBands,
        capturedAt: 0
    )

    func isFresh(at time: TimeInterval, staleAfter: TimeInterval) -> Bool {
        capturedAt > 0 && time - capturedAt <= staleAfter
    }
}

final class SpectrumSnapshotStore: @unchecked Sendable {
    static let shared = SpectrumSnapshotStore()

    private struct State: Sendable {
        var consumerCount = 0
        var latestSnapshot = SpectrumSnapshot.flat
    }

    private let state = OSAllocatedUnfairLock(initialState: State())

    var hasActiveConsumers: Bool {
        state.withLockIfAvailable { $0.consumerCount > 0 } ?? false
    }

    func beginConsuming() {
        state.withLock { $0.consumerCount += 1 }
    }

    func endConsuming() {
        state.withLock { state in
            precondition(state.consumerCount > 0, "Unbalanced spectrum consumer subscription")
            state.consumerCount -= 1
            if state.consumerCount == 0 {
                state.latestSnapshot = .flat
            }
        }
    }

    func publish(bands: [Float], capturedAt: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        state.withLock { state in
            guard state.consumerCount > 0 else { return }
            state.latestSnapshot = SpectrumSnapshot(bands: bands, capturedAt: capturedAt)
        }
    }

    func snapshot() -> SpectrumSnapshot {
        state.withLock { $0.latestSnapshot }
    }
}
