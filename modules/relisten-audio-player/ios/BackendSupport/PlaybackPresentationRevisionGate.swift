import Foundation

// Lightweight latest-wins token for work queued onto DispatchQueue.main.
// Callers own locking; this type only records which queued write is current.
struct PlaybackPresentationRevisionGate {
    private var currentRevision: UInt64 = 0

    mutating func advance() -> UInt64 {
        currentRevision &+= 1
        return currentRevision
    }

    func shouldApply(_ revision: UInt64) -> Bool {
        revision == currentRevision
    }
}
