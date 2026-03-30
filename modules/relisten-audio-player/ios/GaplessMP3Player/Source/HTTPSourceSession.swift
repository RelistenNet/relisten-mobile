import Foundation

/// Progressive byte-0 download session shared by metadata, playback, and cache fill.
actor HTTPSourceSession {
    private struct RetryState: Sendable {
        var attempt: Int
        var delay: TimeInterval?
        var errorDescription: String?
    }

    private let source: GaplessPlaybackSource
    private var requestKind: GaplessHTTPRequestKind
    private let loader: HTTPDataLoading
    private let request: URLRequest
    private let retryPolicy: GaplessHTTPRetryPolicy
    private let cacheMode: GaplessCacheMode
    private let cacheStore: SourceCacheStore
    private let downloadPaths: SourceDownloadPaths
    private let projector: SourceEventProjector

    private var preparationEventHandler: (@Sendable (GaplessPreparationEvent) -> Void)?
    private var runtimeEventHandler: (@Sendable (GaplessRuntimeEvent) -> Void)?
    private var httpLogHandler: (@Sendable (GaplessHTTPLogEvent) -> Void)?

    private var downloadedPrefixEnd: Int64 = 0
    private var isComplete = false
    private var responseFingerprint = CacheFingerprint()
    private var continuationWaiters: [(Int64, CheckedContinuation<Void, Error>)] = []
    private var streamTask: Task<Void, Error>?
    private var storedError: Error?
    private var retryState: RetryState?
    private var resolvedSource: ResolvedSource?

    init(
        source: GaplessPlaybackSource,
        requestKind: GaplessHTTPRequestKind,
        loader: HTTPDataLoading,
        request: URLRequest,
        retryPolicy: GaplessHTTPRetryPolicy,
        cacheMode: GaplessCacheMode,
        cacheStore: SourceCacheStore,
        downloadPaths: SourceDownloadPaths,
        projector: SourceEventProjector,
        preparationEventHandler: (@Sendable (GaplessPreparationEvent) -> Void)? = nil,
        runtimeEventHandler: (@Sendable (GaplessRuntimeEvent) -> Void)? = nil,
        httpLogHandler: (@Sendable (GaplessHTTPLogEvent) -> Void)? = nil
    ) {
        self.source = source
        self.requestKind = requestKind
        self.loader = loader
        self.request = request
        self.retryPolicy = retryPolicy
        self.cacheMode = cacheMode
        self.cacheStore = cacheStore
        self.downloadPaths = downloadPaths
        self.projector = projector
        self.preparationEventHandler = preparationEventHandler
        self.runtimeEventHandler = runtimeEventHandler
        self.httpLogHandler = httpLogHandler
    }

    func start() {
        guard streamTask == nil else { return }
        streamTask = Task {
            try await consumeStream()
        }
    }

    func setEventHandler(_ handler: (@Sendable (GaplessPreparationEvent) -> Void)?) {
        if let handler {
            preparationEventHandler = handler
        }
    }

    func setRuntimeEventHandler(_ handler: (@Sendable (GaplessRuntimeEvent) -> Void)?) {
        runtimeEventHandler = handler
    }

    func setHTTPLogHandler(_ handler: (@Sendable (GaplessHTTPLogEvent) -> Void)?) {
        httpLogHandler = handler
    }

    func promoteRequestKind(to kind: GaplessHTTPRequestKind) {
        if requestKind == .metadata, kind != .metadata {
            requestKind = kind
        }
    }

    func fingerprint() -> CacheFingerprint {
        responseFingerprint
    }

    func contiguousPrefixEnd() -> Int64 {
        downloadedPrefixEnd
    }

    func readPrefix(limit: Int) async throws -> Data {
        try await waitForBytes(Int64(limit))
        let handle = try FileHandle(forReadingFrom: currentReadURL())
        defer { try? handle.close() }
        return try handle.read(upToCount: limit) ?? Data()
    }

    func awaitCompletion() async throws -> ResolvedSource {
        promoteRequestKind(to: .progressive)
        if let storedError {
            throw storedError
        }
        if !isComplete {
            _ = try await streamTask?.value
        }
        if let resolvedSource {
            return resolvedSource
        }
        let source = try cacheStore.persistCompletedDownload(
            for: source,
            paths: downloadPaths,
            fingerprint: responseFingerprint,
            validatedByteLength: downloadedPrefixEnd,
            cacheMode: cacheMode
        )
        resolvedSource = source
        return source
    }

    func status() -> SourceDownloadStatus {
        if let storedError {
            return projector.failedStatus(
                source: source,
                downloadedBytes: downloadedPrefixEnd,
                expectedBytes: responseFingerprint.contentLength ?? source.expectedContentLength,
                errorDescription: describe(storedError),
                resolvedFileURL: resolvedSource?.localFileURL
            )
        }
        if let retryState {
            return projector.retryingStatus(
                source: source,
                downloadedBytes: downloadedPrefixEnd,
                expectedBytes: responseFingerprint.contentLength ?? source.expectedContentLength,
                errorDescription: retryState.errorDescription,
                retryAttempt: retryState.attempt,
                retryDelay: retryState.delay,
                resolvedFileURL: resolvedSource?.localFileURL
            )
        }
        let state: SourceDownloadState = isComplete ? .completed : .downloading
        return projector.downloadingStatus(
            source: source,
            downloadedBytes: downloadedPrefixEnd,
            expectedBytes: responseFingerprint.contentLength ?? source.expectedContentLength,
            state: state,
            resolvedFileURL: resolvedSource?.localFileURL
        )
    }

    func read(offset: Int64, maxLength: Int) async throws -> SourceDataAvailability {
        while true {
            if let storedError {
                throw storedError
            }

            if offset < downloadedPrefixEnd {
                let availableByteCount = Int(min(Int64(maxLength), downloadedPrefixEnd - offset))
                let handle = try FileHandle(forReadingFrom: currentReadURL())
                defer { try? handle.close() }
                try handle.seek(toOffset: UInt64(offset))
                let data = try handle.read(upToCount: availableByteCount) ?? Data()
                if !data.isEmpty {
                    return .available(data)
                }
            }

            if isComplete {
                return .endOfStream
            }

            try await waitForBytes(offset + 1)
        }
    }

    private func currentReadURL() -> URL {
        resolvedSource?.localFileURL ?? (FileManager.default.fileExists(atPath: downloadPaths.tempFileURL.path) ? downloadPaths.tempFileURL : downloadPaths.finalFileURL)
    }

    private func waitForBytes(_ minimumBytes: Int64) async throws {
        if let storedError {
            throw storedError
        }
        if downloadedPrefixEnd >= minimumBytes || isComplete {
            return
        }

        try await withCheckedThrowingContinuation { continuation in
            continuationWaiters.append((minimumBytes, continuation))
        }
    }

    private func consumeStream() async throws {
        let handle = try FileHandle(forWritingTo: downloadPaths.tempFileURL)
        defer { try? handle.close() }

        let transportHandler: @Sendable (HTTPTransportLogEvent) -> Void = { transportEvent in
            Task {
                await self.handleTransportEvent(transportEvent)
            }
        }

        do {
            let stream = loader.progressiveDownload(
                for: request,
                retryPolicy: retryPolicy,
                eventHandler: transportHandler
            )

            for try await event in stream {
                switch event {
                case .response(let response, let restartFromZero):
                    if restartFromZero {
                        try handle.truncate(atOffset: 0)
                        try handle.seek(toOffset: 0)
                        downloadedPrefixEnd = 0
                        emitStatus()
                    }
                    responseFingerprint = URLSessionHTTPDataLoader.fingerprint(from: response)
                    emitStatus()
                case .bytes(let bytes):
                    try handle.seekToEnd()
                    try handle.write(contentsOf: bytes)
                    downloadedPrefixEnd += Int64(bytes.count)
                    emitStatus()
                    resumeSatisfiedWaiters()
                case .completed:
                    try finalizeDownload()
                }
            }
        } catch {
            storedError = error
            emitStatus()
            resumeAllWaiters(with: error)
            throw error
        }
    }

    private func finalizeDownload() throws {
        resolvedSource = try cacheStore.persistCompletedDownload(
            for: source,
            paths: downloadPaths,
            fingerprint: responseFingerprint,
            validatedByteLength: downloadedPrefixEnd,
            cacheMode: cacheMode
        )
        retryState = nil
        isComplete = true
        emitStatus()
        resumeSatisfiedWaiters()
    }

    private func handleTransportEvent(_ transportEvent: HTTPTransportLogEvent) {
        httpLogHandler?(projector.httpLogEvent(source: source, requestKind: requestKind, transportEvent: transportEvent))

        switch transportEvent.kind {
        case .retryScheduled:
            let retryAttempt = min(transportEvent.attempt + 1, retryPolicy.maxAttempts)
            retryState = RetryState(
                attempt: retryAttempt,
                delay: transportEvent.retryDelay,
                errorDescription: transportEvent.errorDescription
            )
            emitStatus()
            runtimeEventHandler?(
                .networkRetrying(
                    projector.retryMessage(
                        sourceID: source.id,
                        retryAttempt: retryAttempt,
                        errorDescription: transportEvent.errorDescription
                    )
                )
            )
        case .requestStarted, .responseReceived, .bytesReceived, .requestCompleted, .resumeAttempt:
            if retryState != nil {
                retryState = nil
                emitStatus()
            }
        case .requestFailed:
            break
        }
    }

    private func emitStatus() {
        preparationEventHandler?(.download(status()))
    }

    private func resumeSatisfiedWaiters() {
        var ready: [CheckedContinuation<Void, Error>] = []
        var waiting: [(Int64, CheckedContinuation<Void, Error>)] = []

        for waiter in continuationWaiters {
            if waiter.0 <= downloadedPrefixEnd || isComplete {
                ready.append(waiter.1)
            } else {
                waiting.append(waiter)
            }
        }

        continuationWaiters = waiting
        ready.forEach { $0.resume() }
    }

    private func resumeAllWaiters(with error: Error) {
        let waiters = continuationWaiters
        continuationWaiters.removeAll()
        waiters.forEach { $0.1.resume(throwing: error) }
    }

    private func describe(_ error: Error) -> String {
        if let localized = error as? LocalizedError, let description = localized.errorDescription {
            return description
        }
        return String(describing: error)
    }
}
