import Foundation

/// Owns local-file, cached-file, progressive-download, and ephemeral range reads for
/// the playback engine.
///
/// The design docs call for one source layer that makes HTTP and local playback look
/// the same to the parser and decoder. This actor is that seam.
actor MP3SourceManager {
    private let cacheMode: GaplessCacheMode
    private let retryPolicy: GaplessHTTPRetryPolicy
    private let loader: HTTPDataLoading
    private let cacheStore: SourceCacheStore
    private let projector: SourceEventProjector

    private var activeDownloads: [String: HTTPSourceSession] = [:]
    private var transientStatuses: [String: SourceDownloadStatus] = [:]
    private var runtimeEventHandler: (@Sendable (GaplessRuntimeEvent) -> Void)?
    private var httpLogHandler: (@Sendable (GaplessHTTPLogEvent) -> Void)?

    init(
        cacheDirectory: URL = FileManager.default.temporaryDirectory.appendingPathComponent("GaplessMP3PlayerCache", isDirectory: true),
        cacheMode: GaplessCacheMode = .enabled,
        retryPolicy: GaplessHTTPRetryPolicy = .init(),
        loader: HTTPDataLoading = URLSessionHTTPDataLoader(),
        fileManager: FileManager = .default
    ) {
        self.cacheMode = cacheMode
        self.retryPolicy = retryPolicy
        self.loader = loader
        self.cacheStore = SourceCacheStore(cacheDirectory: cacheDirectory, fileManager: fileManager)
        self.projector = SourceEventProjector(retryPolicy: retryPolicy)
    }

    func setRuntimeEventHandler(_ handler: (@Sendable (GaplessRuntimeEvent) -> Void)?) async {
        runtimeEventHandler = handler
        for session in activeDownloads.values {
            await session.setRuntimeEventHandler(handler)
        }
    }

    func setHTTPLogHandler(_ handler: (@Sendable (GaplessHTTPLogEvent) -> Void)?) async {
        httpLogHandler = handler
        for session in activeDownloads.values {
            await session.setHTTPLogHandler(handler)
        }
    }

    /// Metadata reads are head-of-file reads only. They intentionally do not require a
    /// full download so the next track can be prepared before the current one finishes.
    func metadataData(
        for source: GaplessPlaybackSource,
        limit: Int = 256 * 1024,
        eventHandler: (@Sendable (GaplessPreparationEvent) -> Void)? = nil
    ) async throws -> (Data, CacheFingerprint) {
        if source.url.isFileURL {
            let data = try Data(contentsOf: source.url, options: .mappedIfSafe)
            let requiredLength = MP3GaplessMetadataParser.requiredPrefixLength(for: Data(data.prefix(10)), defaultLimit: limit)
            eventHandler?(
                .download(
                    SourceDownloadStatus(
                        source: source,
                        state: .localFile,
                        downloadedBytes: Int64(data.count),
                        expectedBytes: Int64(data.count),
                        resolvedFileURL: source.url
                    )
                )
            )
            return (Data(data.prefix(requiredLength)), cacheStore.fingerprintForLocalFile(url: source.url))
        }

        if cacheMode == .enabled,
           let resolved = try cacheStore.resolvedCachedSource(for: source),
           let record = try cacheStore.cachedRecord(for: source) {
            let data = try Data(contentsOf: resolved.localFileURL, options: .mappedIfSafe)
            let requiredLength = MP3GaplessMetadataParser.requiredPrefixLength(for: Data(data.prefix(10)), defaultLimit: limit)
            eventHandler?(
                .download(
                    SourceDownloadStatus(
                        source: source,
                        state: .cached,
                        downloadedBytes: record.validatedByteLength,
                        expectedBytes: record.fingerprint.contentLength ?? source.expectedContentLength,
                        resolvedFileURL: resolved.localFileURL
                    )
                )
            )
            return (Data(data.prefix(requiredLength)), record.fingerprint)
        }

        if let session = activeDownloads[source.cacheKey] {
            let initialPrefix = try await session.readPrefix(limit: 10)
            let requiredLength = MP3GaplessMetadataParser.requiredPrefixLength(for: initialPrefix, defaultLimit: limit)
            return try await (session.readPrefix(limit: requiredLength), session.fingerprint())
        }

        return try await streamMetadataPrefix(for: source, limit: limit, eventHandler: eventHandler)
    }

    /// Resolves a source into a complete local file, using the durable cache when valid
    /// and otherwise awaiting the progressive download to finish.
    func resolvedLocalFile(
        for source: GaplessPlaybackSource,
        eventHandler: (@Sendable (GaplessPreparationEvent) -> Void)? = nil
    ) async throws -> ResolvedSource {
        if source.url.isFileURL {
            let fingerprint = cacheStore.fingerprintForLocalFile(url: source.url)
            eventHandler?(
                .download(
                    SourceDownloadStatus(
                        source: source,
                        state: .localFile,
                        downloadedBytes: fingerprint.contentLength ?? 0,
                        expectedBytes: fingerprint.contentLength,
                        resolvedFileURL: source.url
                    )
                )
            )
            return ResolvedSource(localFileURL: source.url, fingerprint: fingerprint, isCached: false)
        }

        if cacheMode == .enabled,
           let resolved = try cacheStore.resolvedCachedSource(for: source),
           let record = try cacheStore.cachedRecord(for: source) {
            eventHandler?(
                .download(
                    SourceDownloadStatus(
                        source: source,
                        state: .cached,
                        downloadedBytes: record.validatedByteLength,
                        expectedBytes: record.fingerprint.contentLength ?? source.expectedContentLength,
                        resolvedFileURL: resolved.localFileURL
                    )
                )
            )
            return resolved
        }

        let session = try await openSession(for: source, requestKind: .progressive, eventHandler: eventHandler)
        return try await session.awaitCompletion()
    }

    /// Performs an explicit range read. These reads are intentionally ephemeral unless a
    /// separate byte-0 download eventually produces a complete file worth caching.
    func rangeRead(for source: GaplessPlaybackSource, offset: Int64, length: Int64? = nil) async throws -> RangeReadResult {
        guard !source.url.isFileURL else {
            let handle = try FileHandle(forReadingFrom: source.url)
            defer { try? handle.close() }
            try handle.seek(toOffset: UInt64(offset))
            let data = if let length {
                try handle.read(upToCount: Int(length)) ?? Data()
            } else {
                try handle.readToEnd() ?? Data()
            }
            return RangeReadResult(data: data, fingerprint: cacheStore.fingerprintForLocalFile(url: source.url))
        }

        return try await performRangeRequest(
            source: source,
            offset: offset,
            length: length,
            contentLength: source.expectedContentLength,
            trackStatus: false
        )
    }

    /// Creates the linear read session consumed by the decoder.
    ///
    /// The session chooses between local/cached files, the active progressive download,
    /// or an ephemeral range-backed reader depending on what bytes are already present.
    func makeReadSession(
        for source: GaplessPlaybackSource,
        startingOffset: Int64 = 0,
        contentLength: Int64? = nil,
        eventHandler: (@Sendable (GaplessPreparationEvent) -> Void)? = nil,
        allowsParallelRangeRequests: Bool = true
    ) async throws -> SourceReadSession {
        if source.url.isFileURL {
            return try SourceReadSession.local(url: source.url, startingOffset: startingOffset)
        }

        if cacheMode == .enabled,
           let resolved = try cacheStore.resolvedCachedSource(for: source) {
            return try SourceReadSession.local(url: resolved.localFileURL, startingOffset: startingOffset)
        }

        let session = try await openSession(for: source, requestKind: .progressive, eventHandler: eventHandler)
        let currentPrefixEnd = await session.contiguousPrefixEnd()
        if startingOffset > currentPrefixEnd, allowsParallelRangeRequests {
            let knownContentLength = contentLength ?? source.expectedContentLength
            let manager = self
            return SourceReadSession.ranged(
                startingOffset: startingOffset,
                contentLength: knownContentLength,
                reader: { offset, maxLength in
                    try await manager.performRangeRequest(
                        source: source,
                        offset: offset,
                        length: Int64(maxLength),
                        contentLength: knownContentLength,
                        trackStatus: true
                    )
                }
            )
        }

        return SourceReadSession.progressive(session: session, startingOffset: startingOffset)
    }

    func preload(
        _ source: GaplessPlaybackSource,
        eventHandler: (@Sendable (GaplessPreparationEvent) -> Void)? = nil
    ) async throws {
        if source.url.isFileURL {
            return
        }

        if cacheMode == .enabled,
           (try cacheStore.resolvedCachedSource(for: source)) != nil {
            return
        }

        _ = try await openSession(for: source, requestKind: .progressive, eventHandler: eventHandler)
    }

    func downloadStatus(for source: GaplessPlaybackSource?) async -> SourceDownloadStatus? {
        guard let source else { return nil }

        if source.url.isFileURL {
            let expected = cacheStore.fingerprintForLocalFile(url: source.url).contentLength
            return SourceDownloadStatus(
                source: source,
                state: .localFile,
                downloadedBytes: expected ?? 0,
                expectedBytes: expected,
                resolvedFileURL: source.url
            )
        }

        if let active = activeDownloads[source.cacheKey] {
            return await active.status()
        }

        if let transient = transientStatuses[source.cacheKey] {
            return transient
        }

        if cacheMode == .enabled,
           let resolved = try? cacheStore.resolvedCachedSource(for: source),
           let record = try? cacheStore.cachedRecord(for: source) {
            return SourceDownloadStatus(
                source: source,
                state: .cached,
                downloadedBytes: record.validatedByteLength,
                expectedBytes: record.fingerprint.contentLength ?? source.expectedContentLength,
                resolvedFileURL: resolved.localFileURL
            )
        }

        return SourceDownloadStatus(
            source: source,
            state: .idle,
            downloadedBytes: 0,
            expectedBytes: source.expectedContentLength
        )
    }

    private func openSession(
        for source: GaplessPlaybackSource,
        requestKind: GaplessHTTPRequestKind,
        eventHandler: (@Sendable (GaplessPreparationEvent) -> Void)? = nil
    ) async throws -> HTTPSourceSession {
        if let existing = activeDownloads[source.cacheKey] {
            await existing.promoteRequestKind(to: requestKind)
            await existing.setEventHandler(eventHandler)
            await existing.setRuntimeEventHandler(runtimeEventHandler)
            await existing.setHTTPLogHandler(httpLogHandler)
            return existing
        }

        let downloadPaths = try cacheStore.makeDownloadPaths(for: source)
        var request = URLRequest(url: source.url)
        source.headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }

        let session = HTTPSourceSession(
            source: source,
            requestKind: requestKind,
            loader: loader,
            request: request,
            retryPolicy: retryPolicy,
            cacheMode: cacheMode,
            cacheStore: cacheStore,
            downloadPaths: downloadPaths,
            projector: projector,
            preparationEventHandler: eventHandler,
            runtimeEventHandler: runtimeEventHandler,
            httpLogHandler: httpLogHandler
        )
        await session.start()
        activeDownloads[source.cacheKey] = session
        Task {
            do {
                _ = try await session.awaitCompletion()
            } catch {}
            let terminalStatus = await session.status()
            self.downloadFinished(cacheKey: source.cacheKey, terminalStatus: terminalStatus)
        }
        return session
    }

    private func performRangeRequest(
        source: GaplessPlaybackSource,
        offset: Int64,
        length: Int64?,
        contentLength: Int64?,
        trackStatus: Bool
    ) async throws -> RangeReadResult {
        if let contentLength, offset >= contentLength {
            return RangeReadResult(data: Data(), fingerprint: .init(contentLength: contentLength))
        }

        var request = URLRequest(url: source.url)
        source.headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        let requestedEnd = if let length {
            offset + length - 1
        } else {
            contentLength.map { max(offset, $0 - 1) } ?? offset
        }
        let clampedEnd = if let contentLength {
            min(requestedEnd, max(contentLength - 1, offset))
        } else {
            requestedEnd
        }
        request.setValue("bytes=\(offset)-\(clampedEnd)", forHTTPHeaderField: "Range")

        if trackStatus {
            transientStatuses[source.cacheKey] = SourceDownloadStatus(
                source: source,
                state: .downloading,
                downloadedBytes: offset,
                expectedBytes: contentLength ?? source.expectedContentLength
            )
        }

        let manager = self
        let shouldEmitHTTPLog = httpLogHandler != nil
        let handler: (@Sendable (HTTPTransportLogEvent) -> Void)? = {
            guard trackStatus || shouldEmitHTTPLog else { return nil }
            return { transportEvent in
                Task {
                    await manager.handleRangeTransportEvent(
                        transportEvent,
                        source: source,
                        offset: offset,
                        expectedBytes: contentLength ?? source.expectedContentLength,
                        trackStatus: trackStatus
                    )
                }
            }
        }()

        do {
            let result = try await loader.rangeRequest(for: request, retryPolicy: retryPolicy, eventHandler: handler)
            if trackStatus {
                transientStatuses.removeValue(forKey: source.cacheKey)
            }
            return result
        } catch {
            if trackStatus {
                let failedStatus = SourceDownloadStatus(
                    source: source,
                    state: .failed,
                    downloadedBytes: offset,
                    expectedBytes: contentLength ?? source.expectedContentLength,
                    errorDescription: describe(error)
                )
                transientStatuses[source.cacheKey] = failedStatus
            }
            throw error
        }
    }

    private func streamMetadataPrefix(
        for source: GaplessPlaybackSource,
        limit: Int,
        eventHandler: (@Sendable (GaplessPreparationEvent) -> Void)?
    ) async throws -> (Data, CacheFingerprint) {
        transientStatuses[source.cacheKey] = projector.downloadingStatus(
            source: source,
            downloadedBytes: 0,
            expectedBytes: source.expectedContentLength
        )
        eventHandler?(.download(transientStatuses[source.cacheKey]!))

        var request = URLRequest(url: source.url)
        source.headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }

        var fingerprint = CacheFingerprint()
        var prefix = Data()
        var requiredLength = limit
        let manager = self
        let shouldEmitHTTPLog = httpLogHandler != nil
        let handler: (@Sendable (HTTPTransportLogEvent) -> Void)? = {
            guard shouldEmitHTTPLog || eventHandler != nil else { return nil }
            return { transportEvent in
                Task {
                    await manager.handleMetadataTransportEvent(
                        transportEvent,
                        source: source,
                        eventHandler: eventHandler
                    )
                }
            }
        }()

        do {
            let stream = loader.progressiveDownload(for: request, retryPolicy: retryPolicy, eventHandler: handler)
            for try await responseEvent in stream {
                switch responseEvent {
                case .response(let response, let restartFromZero):
                    if restartFromZero {
                        prefix.removeAll(keepingCapacity: true)
                    }
                    fingerprint = URLSessionHTTPDataLoader.fingerprint(from: response)
                    transientStatuses[source.cacheKey] = projector.downloadingStatus(
                        source: source,
                        downloadedBytes: Int64(prefix.count),
                        expectedBytes: fingerprint.contentLength ?? source.expectedContentLength
                    )
                    if let status = transientStatuses[source.cacheKey] {
                        eventHandler?(.download(status))
                    }
                case .bytes(let bytes):
                    prefix.append(bytes)
                    if prefix.count >= 10 {
                        requiredLength = MP3GaplessMetadataParser.requiredPrefixLength(
                            for: Data(prefix.prefix(10)),
                            defaultLimit: limit
                        )
                    }
                    transientStatuses[source.cacheKey] = projector.downloadingStatus(
                        source: source,
                        downloadedBytes: Int64(prefix.count),
                        expectedBytes: fingerprint.contentLength ?? source.expectedContentLength
                    )
                    if let status = transientStatuses[source.cacheKey] {
                        eventHandler?(.download(status))
                    }
                    if prefix.count >= requiredLength {
                        transientStatuses.removeValue(forKey: source.cacheKey)
                        return (Data(prefix.prefix(requiredLength)), fingerprint)
                    }
                case .completed:
                    break
                }
            }

            transientStatuses.removeValue(forKey: source.cacheKey)
            return (prefix, fingerprint)
        } catch {
            transientStatuses[source.cacheKey] = projector.failedStatus(
                source: source,
                downloadedBytes: Int64(prefix.count),
                expectedBytes: fingerprint.contentLength ?? source.expectedContentLength,
                errorDescription: describe(error)
            )
            throw error
        }
    }

    private func handleMetadataTransportEvent(
        _ transportEvent: HTTPTransportLogEvent,
        source: GaplessPlaybackSource,
        eventHandler: (@Sendable (GaplessPreparationEvent) -> Void)?
    ) {
        emitHTTPLog(for: source, requestKind: .metadata, transportEvent: transportEvent)
        let downloadedBytes = transportEvent.cumulativeBytes ?? 0

        switch transportEvent.kind {
        case .retryScheduled:
            let retryAttempt = min(transportEvent.attempt + 1, retryPolicy.maxAttempts)
            let status = projector.retryingStatus(
                source: source,
                downloadedBytes: downloadedBytes,
                expectedBytes: source.expectedContentLength,
                errorDescription: transportEvent.errorDescription,
                retryAttempt: retryAttempt,
                retryDelay: transportEvent.retryDelay
            )
            transientStatuses[source.cacheKey] = status
            eventHandler?(.download(status))
            runtimeEventHandler?(
                .networkRetrying(
                    projector.retryMessage(
                        sourceID: source.id,
                        retryAttempt: retryAttempt,
                        errorDescription: transportEvent.errorDescription
                    )
                )
            )
        case .requestFailed:
            if transportEvent.retryDelay == nil {
                let status = projector.failedStatus(
                    source: source,
                    downloadedBytes: downloadedBytes,
                    expectedBytes: source.expectedContentLength,
                    errorDescription: transportEvent.errorDescription
                )
                transientStatuses[source.cacheKey] = status
                eventHandler?(.download(status))
            }
        default:
            break
        }
    }

    private func handleRangeTransportEvent(
        _ transportEvent: HTTPTransportLogEvent,
        source: GaplessPlaybackSource,
        offset: Int64,
        expectedBytes: Int64?,
        trackStatus: Bool
    ) {
        emitHTTPLog(for: source, requestKind: .range, transportEvent: transportEvent)

        guard trackStatus else { return }

        switch transportEvent.kind {
        case .retryScheduled:
            let retryAttempt = min(transportEvent.attempt + 1, retryPolicy.maxAttempts)
            let status = projector.retryingStatus(
                source: source,
                downloadedBytes: offset + (transportEvent.cumulativeBytes ?? 0),
                expectedBytes: expectedBytes,
                errorDescription: transportEvent.errorDescription,
                retryAttempt: retryAttempt,
                retryDelay: transportEvent.retryDelay
            )
            transientStatuses[source.cacheKey] = status
            runtimeEventHandler?(.networkRetrying(projector.retryMessage(sourceID: source.id, retryAttempt: retryAttempt, errorDescription: transportEvent.errorDescription)))
        case .requestStarted, .responseReceived, .bytesReceived, .requestCompleted, .resumeAttempt:
            transientStatuses[source.cacheKey] = projector.downloadingStatus(
                source: source,
                downloadedBytes: offset + (transportEvent.cumulativeBytes ?? 0),
                expectedBytes: expectedBytes
            )
            if transportEvent.kind == .requestCompleted {
                transientStatuses.removeValue(forKey: source.cacheKey)
            }
        case .requestFailed:
            if transportEvent.retryDelay == nil {
                transientStatuses[source.cacheKey] = projector.failedStatus(
                    source: source,
                    downloadedBytes: offset + (transportEvent.cumulativeBytes ?? 0),
                    expectedBytes: expectedBytes,
                    errorDescription: transportEvent.errorDescription
                )
            }
        }
    }

    private func emitHTTPLog(
        for source: GaplessPlaybackSource,
        requestKind: GaplessHTTPRequestKind,
        transportEvent: HTTPTransportLogEvent
    ) {
        httpLogHandler?(projector.httpLogEvent(source: source, requestKind: requestKind, transportEvent: transportEvent))
    }

    private func downloadFinished(cacheKey: String, terminalStatus: SourceDownloadStatus) {
        activeDownloads.removeValue(forKey: cacheKey)
        if terminalStatus.state == .failed || cacheMode == .disabled {
            transientStatuses[cacheKey] = terminalStatus
        } else {
            transientStatuses.removeValue(forKey: cacheKey)
        }
    }

    private func describe(_ error: Error) -> String {
        if let localized = error as? LocalizedError, let description = localized.errorDescription {
            return description
        }
        return String(describing: error)
    }
}
