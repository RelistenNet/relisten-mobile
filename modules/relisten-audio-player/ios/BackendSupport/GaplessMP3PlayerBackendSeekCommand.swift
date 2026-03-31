import Foundation

struct SeekCommandState {
    let hasCurrentTrack: Bool
    let currentDuration: TimeInterval?
    let requestedTime: TimeInterval

    var clampedTime: TimeInterval? {
        guard hasCurrentTrack else { return nil }
        let maxDuration = currentDuration ?? requestedTime
        return max(0, min(requestedTime, maxDuration))
    }

    func perform<Status>(
        seek: (TimeInterval) async throws -> Void,
        status: () async -> Status,
        applyStatus: (Status) -> Void,
        emitError: (Error) -> Void
    ) async {
        guard let clampedTime else { return }

        do {
            try await seek(clampedTime)
            let currentStatus = await status()
            applyStatus(currentStatus)
        } catch {
            emitError(error)
        }
    }
}
