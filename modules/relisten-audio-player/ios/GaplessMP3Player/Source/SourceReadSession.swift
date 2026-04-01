import Foundation

enum SourceReadIntent: Sendable {
    case normalStart
    case seekStart
}

enum SourceReadSessionUpgradeTarget: Sendable {
    case none(progressiveResetEpoch: UInt64)
    case progressive(HTTPSourceSession, fingerprint: CacheFingerprint, resetEpoch: UInt64)
    case local(ResolvedSource)
}

/// Read result used by progressive sessions.
///
/// The distinction between `awaitMoreData` and `endOfStream` is central to the design:
/// temporary network starvation must not trigger final padding trim or final-track
/// completion.
enum SourceDataAvailability: Sendable, Equatable {
    case available(Data)
    case awaitMoreData
    case endOfStream
}

/// Result of one ephemeral range read, including any response fingerprint the server exposed.
struct RangeReadResult: Sendable, Equatable {
    var data: Data
    var fingerprint: CacheFingerprint
}

struct SourceReadBridgeWindow: Sendable {
    var startOffset: Int64
    var data: Data
    var fingerprint: CacheFingerprint

    var endOffsetExclusive: Int64 {
        startOffset + Int64(data.count)
    }

    func contains(_ offset: Int64) -> Bool {
        offset >= startOffset && offset < endOffsetExclusive
    }
}

/// Linear byte reader used by the decoder regardless of whether bytes come from a file,
/// the progressive download, or an ephemeral range read.
actor SourceReadSession {
    struct BridgedReadState {
        var contentLength: Int64?
        var requestSizeBytes: Int64
        var prefetchLowWatermarkBytes: Int64
        var rangeReader: @Sendable (Int64, Int64) async throws -> RangeReadResult
        var upgradeResolver: @Sendable (Int64) async throws -> SourceReadSessionUpgradeTarget
        var activeWindow: SourceReadBridgeWindow?
        var activeWindowTask: Task<SourceReadBridgeWindow, Error>?
        var prefetchedWindowTask: Task<SourceReadBridgeWindow, Error>?
        var expectedFingerprint: CacheFingerprint?
        var observedProgressiveResetEpoch: UInt64 = 0
    }

    enum Backend {
        case local(FileHandle)
        case progressive(HTTPSourceSession)
        case bridged(BridgedReadState)
    }

    private var backend: Backend
    private var offset: Int64

    private init(backend: Backend, startingOffset: Int64) {
        self.backend = backend
        self.offset = startingOffset
    }

    static func local(url: URL, startingOffset: Int64) throws -> SourceReadSession {
        let handle = try FileHandle(forReadingFrom: url)
        try handle.seek(toOffset: UInt64(startingOffset))
        return SourceReadSession(backend: .local(handle), startingOffset: startingOffset)
    }

    static func progressive(session: HTTPSourceSession, startingOffset: Int64) -> SourceReadSession {
        SourceReadSession(backend: .progressive(session), startingOffset: startingOffset)
    }

    static func bridged(
        startingOffset: Int64,
        contentLength: Int64?,
        requestSizeBytes: Int64,
        prefetchLowWatermarkBytes: Int64,
        rangeReader: @escaping @Sendable (Int64, Int64) async throws -> RangeReadResult,
        upgradeResolver: @escaping @Sendable (Int64) async throws -> SourceReadSessionUpgradeTarget
    ) -> SourceReadSession {
        SourceReadSession(
            backend: .bridged(
                BridgedReadState(
                    contentLength: contentLength,
                    requestSizeBytes: max(requestSizeBytes, 1),
                    prefetchLowWatermarkBytes: max(min(prefetchLowWatermarkBytes, requestSizeBytes), 1),
                    rangeReader: rangeReader,
                    upgradeResolver: upgradeResolver
                )
            ),
            startingOffset: startingOffset
        )
    }

    deinit {
        switch backend {
        case .local(let handle):
            try? handle.close()
        case .bridged(let state):
            state.activeWindowTask?.cancel()
            state.prefetchedWindowTask?.cancel()
        case .progressive:
            break
        }
    }

    func read(maxLength: Int) async throws -> SourceDataAvailability {
        switch backend {
        case .local(let handle):
            let data = try handle.read(upToCount: maxLength) ?? Data()
            offset += Int64(data.count)
            return data.isEmpty ? .endOfStream : .available(data)
        case .progressive(let session):
            let availability = try await session.read(offset: offset, maxLength: maxLength)
            if case .available(let data) = availability {
                offset += Int64(data.count)
            }
            return availability
        case .bridged(var state):
            let availability = try await readFromBridge(state: &state, maxLength: maxLength)
            if case .bridged = backend {
                backend = .bridged(state)
            }
            return availability
        }
    }

    func seek(to offset: Int64) async throws {
        self.offset = offset
        switch backend {
        case .local(let handle):
            try handle.seek(toOffset: UInt64(offset))
        case .bridged(var state):
            state.activeWindow = nil
            state.activeWindowTask?.cancel()
            state.activeWindowTask = nil
            state.prefetchedWindowTask?.cancel()
            state.prefetchedWindowTask = nil
            backend = .bridged(state)
        case .progressive:
            break
        }
    }

    private func readFromBridge(
        state: inout BridgedReadState,
        maxLength: Int
    ) async throws -> SourceDataAvailability {
        if let contentLength = state.contentLength, offset >= contentLength {
            cancelPrefetchedWindowTask(state: &state)
            return .endOfStream
        }

        try await ensureBridgeWindow(state: &state, requiredOffset: offset)

        guard case .bridged = backend else {
            return try await read(maxLength: maxLength)
        }

        guard let activeWindow = state.activeWindow, activeWindow.contains(offset) else {
            return .awaitMoreData
        }

        let localOffset = Int(offset - activeWindow.startOffset)
        let availableByteCount = min(maxLength, activeWindow.data.count - localOffset)
        let data = activeWindow.data.subdata(in: localOffset..<(localOffset + availableByteCount))
        offset += Int64(data.count)
        maybePrefetchNextBridgeWindow(state: &state)
        return data.isEmpty ? .endOfStream : .available(data)
    }

    private func ensureBridgeWindow(
        state: inout BridgedReadState,
        requiredOffset: Int64
    ) async throws {
        while true {
            if let activeWindow = state.activeWindow, activeWindow.contains(requiredOffset) {
                return
            }

            state.activeWindow = nil

            if try await attemptBridgeUpgrade(state: &state, requiredOffset: requiredOffset) {
                return
            }

            if let prefetchedWindowTask = state.prefetchedWindowTask {
                let prefetchedWindow = try await awaitBridgeWindowTask(prefetchedWindowTask)
                state.prefetchedWindowTask = nil
                try validateBridgeFingerprint(prefetchedWindow.fingerprint, state: &state)
                if prefetchedWindow.contains(requiredOffset) {
                    state.activeWindow = prefetchedWindow
                    return
                }
                if prefetchedWindow.endOffsetExclusive <= requiredOffset {
                    continue
                }
                state.activeWindow = prefetchedWindow
                return
            }

            if state.activeWindowTask == nil {
                state.activeWindowTask = makeBridgeWindowTask(state: state, startingOffset: requiredOffset)
            }

            guard let activeWindowTask = state.activeWindowTask else {
                return
            }

            let activeWindow = try await awaitBridgeWindowTask(activeWindowTask)
            state.activeWindowTask = nil
            try validateBridgeFingerprint(activeWindow.fingerprint, state: &state)
            state.activeWindow = activeWindow
            return
        }
    }

    private func attemptBridgeUpgrade(
        state: inout BridgedReadState,
        requiredOffset: Int64
    ) async throws -> Bool {
        let upgradeTarget = try await state.upgradeResolver(requiredOffset)
        switch upgradeTarget {
        case .none(let progressiveResetEpoch):
            state.observedProgressiveResetEpoch = progressiveResetEpoch
            return false
        case .progressive(let session, let fingerprint, let resetEpoch):
            state.observedProgressiveResetEpoch = resetEpoch
            try validateUpgradeFingerprint(fingerprint, state: state, backend: "progressive")
            cancelActiveWindowTask(state: &state)
            cancelPrefetchedWindowTask(state: &state)
            backend = .progressive(session)
            return true
        case .local(let resolvedSource):
            cancelPrefetchedWindowTask(state: &state)
            cancelActiveWindowTask(state: &state)
            try validateUpgradeFingerprint(resolvedSource.fingerprint, state: state, backend: "local")
            let handle = try FileHandle(forReadingFrom: resolvedSource.localFileURL)
            try handle.seek(toOffset: UInt64(requiredOffset))
            backend = .local(handle)
            return true
        }
    }

    private func maybePrefetchNextBridgeWindow(state: inout BridgedReadState) {
        guard state.prefetchedWindowTask == nil,
              let activeWindow = state.activeWindow else {
            return
        }

        let remainingBytes = activeWindow.endOffsetExclusive - offset
        guard remainingBytes <= state.prefetchLowWatermarkBytes else {
            return
        }

        let nextWindowOffset = activeWindow.endOffsetExclusive
        if let contentLength = state.contentLength, nextWindowOffset >= contentLength {
            return
        }

        let requestSizeBytes = state.requestSizeBytes
        let rangeReader = state.rangeReader
        state.prefetchedWindowTask = Task {
            let result = try await rangeReader(nextWindowOffset, requestSizeBytes)
            return SourceReadBridgeWindow(
                startOffset: nextWindowOffset,
                data: result.data,
                fingerprint: result.fingerprint
            )
        }
    }

    private func makeBridgeWindowTask(
        state: BridgedReadState,
        startingOffset: Int64
    ) -> Task<SourceReadBridgeWindow, Error> {
        Task {
            let result = try await state.rangeReader(startingOffset, state.requestSizeBytes)
            return SourceReadBridgeWindow(
                startOffset: startingOffset,
                data: result.data,
                fingerprint: result.fingerprint
            )
        }
    }

    private func awaitBridgeWindowTask(
        _ task: Task<SourceReadBridgeWindow, Error>
    ) async throws -> SourceReadBridgeWindow {
        try await withTaskCancellationHandler {
            try await task.value
        } onCancel: {
            task.cancel()
        }
    }

    private func validateBridgeFingerprint(
        _ fingerprint: CacheFingerprint,
        state: inout BridgedReadState
    ) throws {
        guard let expectedFingerprint = state.expectedFingerprint else {
            state.expectedFingerprint = fingerprint
            return
        }

        guard expectedFingerprint.isCompatibleForSequentialPlayback(with: fingerprint) else {
            throw GaplessMP3PlayerError.sourceIdentityMismatch("Bridge range response fingerprint changed mid-seek")
        }
    }

    private func validateUpgradeFingerprint(
        _ fingerprint: CacheFingerprint,
        state: BridgedReadState,
        backend: String
    ) throws {
        guard let expectedFingerprint = state.expectedFingerprint else {
            return
        }

        guard expectedFingerprint.isCompatibleForSequentialPlayback(with: fingerprint) else {
            throw GaplessMP3PlayerError.sourceIdentityMismatch("Refused to switch bridged playback to \(backend) bytes with a different fingerprint")
        }
    }

    private func cancelActiveWindowTask(state: inout BridgedReadState) {
        state.activeWindowTask?.cancel()
        state.activeWindowTask = nil
    }

    private func cancelPrefetchedWindowTask(state: inout BridgedReadState) {
        state.prefetchedWindowTask?.cancel()
        state.prefetchedWindowTask = nil
    }
}
