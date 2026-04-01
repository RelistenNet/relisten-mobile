import Foundation

private let sourcePreloadLog = RelistenPlaybackLogger(layer: .source, category: .preload)

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
    private var isShutdown = false
    private var preloadRequests: Set<String> = []

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

    /// Metadata reads still return only the required prefix, but remote cache misses now
    /// flow through the shared byte-0 session so later preload/play work reuses the
    /// same request instead of starting a second download.
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

        let session = try await openSession(for: source, requestKind: .metadata, eventHandler: eventHandler)
        let initialPrefix = try await session.readPrefix(limit: 10)
        let requiredLength = MP3GaplessMetadataParser.requiredPrefixLength(for: initialPrefix, defaultLimit: limit)
        return try await (session.readPrefix(limit: requiredLength), session.fingerprint())
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
        allowsParallelRangeRequests: Bool = true,
        readIntent: SourceReadIntent = .normalStart,
        rangeRequestSizeBytes: Int64 = SourceReadSizing.defaultSeekRangeRequestSizeBytes,
        rangePrefetchLowWatermarkBytes: Int64 = SourceReadSizing.defaultSeekRangePrefetchLowWatermarkBytes
    ) async throws -> SourceReadSession {
        if source.url.isFileURL {
            return try SourceReadSession.local(
                url: source.url,
                startingOffset: startingOffset,
                sourceID: source.id,
                kind: .file
            )
        }

        if cacheMode == .enabled,
           let resolved = try cacheStore.resolvedCachedSource(for: source) {
            return try SourceReadSession.local(
                url: resolved.localFileURL,
                startingOffset: startingOffset,
                sourceID: source.id,
                kind: .cached
            )
        }

        let session = try await openSession(for: source, requestKind: .progressive, eventHandler: eventHandler)
        let currentPrefixEnd = await session.contiguousPrefixEnd()
        let shouldBridgeSeek = readIntent == .seekStart && allowsParallelRangeRequests && startingOffset >= currentPrefixEnd
        if shouldBridgeSeek {
            let knownContentLength = contentLength ?? source.expectedContentLength
            let manager = self
            return SourceReadSession.bridged(
                sourceID: source.id,
                startingOffset: startingOffset,
                contentLength: knownContentLength,
                requestSizeBytes: rangeRequestSizeBytes,
                prefetchLowWatermarkBytes: rangePrefetchLowWatermarkBytes,
                rangeReader: { offset, length in
                    try await manager.performRangeRequest(
                        source: source,
                        offset: offset,
                        length: length,
                        contentLength: knownContentLength,
                        trackStatus: true
                    )
                },
                upgradeResolver: { offset in
                    try await manager.upgradeTargetForBridgeRead(source: source, requiredOffset: offset)
                }
            )
        }

        return SourceReadSession.progressive(
            session: session,
            startingOffset: startingOffset,
            sourceID: source.id
        )
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

        let shouldLogStart = preloadRequests.insert(source.cacheKey).inserted
        if shouldLogStart {
            sourcePreloadLog.info(
                "started",
                "preload",
                playbackLogField("src", source.id)
            )
        }
        do {
            _ = try await openSession(for: source, requestKind: .progressive, eventHandler: eventHandler)
        } catch {
            preloadRequests.remove(source.cacheKey)
            throw error
        }
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

    func shutdown() async {
        isShutdown = true
        let sessions = Array(activeDownloads.values)
        activeDownloads.removeAll()
        transientStatuses.removeAll()
        preloadRequests.removeAll()
        for session in sessions {
            await session.shutdown()
        }
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
        activeDownloads[source.cacheKey] = session
        await session.start()
        Task {
            let terminalStatus = await session.waitForTerminalStatus()
            self.downloadFinished(cacheKey: source.cacheKey, session: session, terminalStatus: terminalStatus)
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

    private func upgradeTargetForBridgeRead(
        source: GaplessPlaybackSource,
        requiredOffset: Int64
    ) async throws -> SourceReadSessionUpgradeTarget {
        if source.url.isFileURL {
            return .local(
                ResolvedSource(
                    localFileURL: source.url,
                    fingerprint: cacheStore.fingerprintForLocalFile(url: source.url),
                    isCached: false
                )
            )
        }

        if cacheMode == .enabled,
           let resolved = try cacheStore.resolvedCachedSource(for: source) {
            return .local(resolved)
        }

        guard let session = activeDownloads[source.cacheKey] else {
            return .none(progressiveResetEpoch: 0)
        }

        let snapshot = await session.bridgeSnapshot()
        if let resolvedSource = snapshot.resolvedSource {
            return .local(resolvedSource)
        }

        if snapshot.contiguousPrefixEnd > requiredOffset {
            return .progressive(session, fingerprint: snapshot.fingerprint, resetEpoch: snapshot.resetEpoch)
        }

        return .none(progressiveResetEpoch: snapshot.resetEpoch)
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
        case .requestStarted, .requestPromoted, .responseReceived, .bytesReceived, .requestCompleted, .resumeAttempt:
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

    private func downloadFinished(
        cacheKey: String,
        session: HTTPSourceSession,
        terminalStatus: SourceDownloadStatus
    ) {
        guard !isShutdown else { return }
        if let activeSession = activeDownloads[cacheKey], activeSession === session {
            activeDownloads.removeValue(forKey: cacheKey)
        }
        let shouldLogPreloadCompletion = preloadRequests.remove(cacheKey) != nil
        if shouldLogPreloadCompletion,
           terminalStatus.state == .cached || terminalStatus.state == .completed {
            sourcePreloadLog.info(
                "completed",
                "preload",
                playbackLogField("src", terminalStatus.source.id),
                playbackLogIntegerField("bytes", terminalStatus.downloadedBytes),
                playbackLogPathField("path", terminalStatus.resolvedFileURL)
            )
        }
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
