import Foundation

/// A single observation captured on the backend queue, before bridge delivery.
struct PlaybackCheckpoint: Codable, Sendable {
    let sessionId: String
    let sequence: UInt64
    let identifier: String
    let sourceTrackUuid: String
    let elapsed: Double?
    let duration: Double?
    let capturedAt: Double
    let playbackState: String
    let trackChanged: Bool
    let checkpoint: Bool

    var payload: [String: Any] {
        var result: [String: Any] = [
            "sessionId": sessionId, "sequence": sequence,
            "identifier": identifier, "sourceTrackUuid": sourceTrackUuid,
            "capturedAt": capturedAt, "playbackState": playbackState,
            "trackChanged": trackChanged, "checkpoint": checkpoint
        ]
        if let elapsed, elapsed.isFinite { result["elapsed"] = elapsed }
        if let duration, duration.isFinite { result["duration"] = duration }
        return result
    }
}

/// The journal covers the native-to-JS gap; Realm remains the owner of the queue.
/// Atomic replacement exposes either the previous complete record or the new one.
final class PlaybackCheckpointStore: @unchecked Sendable {
    let url: URL
    private var lastWritten: PlaybackCheckpoint?
    private var activeSessionId: String?
    private var nextValue: UInt64 = 0
    private var lastWriteUptime = -Double.infinity
    private let lock = NSLock()

    init(url: URL) {
        self.url = url
        if let data = try? Data(contentsOf: url), let record = try? JSONDecoder().decode(PlaybackCheckpoint.self, from: data) {
            lastWritten = record
            nextValue = record.sequence
        }
    }

    func activate(sessionId: String) {
        lock.lock()
        defer { lock.unlock() }
        activeSessionId = sessionId
    }

    func nextSequence() -> UInt64 {
        lock.lock()
        defer { lock.unlock() }
        nextValue += 1
        return nextValue
    }

    private static let shared = makeApplicationStore()

    static func applicationStore() -> PlaybackCheckpointStore { shared }

    private static func makeApplicationStore() -> PlaybackCheckpointStore {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return PlaybackCheckpointStore(url: root.appendingPathComponent("Relisten/playback-checkpoint.json"))
    }

    func read() -> PlaybackCheckpoint? {
        lock.lock()
        defer { lock.unlock() }
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(PlaybackCheckpoint.self, from: data)
    }

    @discardableResult
    func write(_ snapshot: PlaybackCheckpoint, uptime: Double = ProcessInfo.processInfo.systemUptime) throws -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if let activeSessionId, snapshot.sessionId != activeSessionId { return false }
        if let lastWritten, snapshot.sequence <= lastWritten.sequence { return false }
        if let lastWritten,
           snapshot.identifier == lastWritten.identifier,
           snapshot.elapsed == lastWritten.elapsed,
           snapshot.duration == lastWritten.duration,
           snapshot.playbackState == lastWritten.playbackState { return false }
        if !snapshot.checkpoint && !snapshot.trackChanged && uptime - lastWriteUptime < 5 { return false }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(snapshot)
        try data.write(to: url, options: .atomic)
        lastWritten = snapshot
        lastWriteUptime = uptime
        return true
    }
}
