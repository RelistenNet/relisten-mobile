import Foundation

struct SeekCommandExecution {
    let clampedTime: TimeInterval
    let generation: UInt64

    func shouldApplyResult(activeGeneration: UInt64) -> Bool {
        activeGeneration == generation
    }

    func perform<Status>(
        seek: (TimeInterval) async throws -> Void,
        status: () async -> Status,
        complete: (Status) -> Void,
        emitError: (Error) -> Void
    ) async {
        do {
            try await seek(clampedTime)
            complete(await status())
        } catch {
            emitError(error)
        }
    }
}

struct SeekCommandState {
    let hasCurrentTrack: Bool
    let currentDuration: TimeInterval?
    let requestedTime: TimeInterval
    let activeGeneration: UInt64

    var clampedTime: TimeInterval? {
        guard hasCurrentTrack else { return nil }
        let maxDuration = currentDuration ?? requestedTime
        return max(0, min(requestedTime, maxDuration))
    }

    func begin(updateElapsed: (TimeInterval) -> Void) -> SeekCommandExecution? {
        guard let clampedTime else { return nil }
        updateElapsed(clampedTime)
        return SeekCommandExecution(
            clampedTime: clampedTime,
            generation: activeGeneration
        )
    }
}
