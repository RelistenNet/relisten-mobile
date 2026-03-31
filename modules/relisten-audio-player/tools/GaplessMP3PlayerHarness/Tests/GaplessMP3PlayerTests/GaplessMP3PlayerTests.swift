import Foundation
import XCTest
@testable import GaplessMP3Player

final class GaplessMP3PlayerTests: XCTestCase {
    func testPrepareAllowsMixedSampleRatesUsingFixedSessionOutputFormat() async throws {
        let outputGraph = TestOutputGraph()
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let next = fixtureSource(id: "next", fixtureName: "gd77-s2t07-first-5s-44k1-stereo.mp3")

        try await player.prepare(current: current, next: next)

        let report = try XCTUnwrap(player.latestPreparationReport)
        XCTAssertEqual(report.sampleRate, 44_100)
        XCTAssertEqual(report.outputChannelCount, 2)
        XCTAssertEqual(report.current.metadata.sampleRate, 48_000)
        XCTAssertEqual(report.next?.metadata.sampleRate, 44_100)
    }

    func testPrepareAllowsMixedChannelCountsUsingFixedSessionOutputFormat() async throws {
        let outputGraph = TestOutputGraph()
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let next = fixtureSource(id: "next", fixtureName: "gd77-s2t05-first-5s-48k-mono.mp3")

        try await player.prepare(current: current, next: next)

        let report = try XCTUnwrap(player.latestPreparationReport)
        XCTAssertEqual(report.sampleRate, 44_100)
        XCTAssertEqual(report.outputChannelCount, 2)
        XCTAssertEqual(report.current.metadata.channelCount, 2)
        XCTAssertEqual(report.next?.metadata.channelCount, 1)
    }

    func testPrepareReportsPausedPhaseSourceIdentityAndResolvedFileURLs() async throws {
        let outputGraph = TestOutputGraph()
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let next = fixtureSource(id: "next", fixtureName: "gd77-s2t05-first-5s.mp3")

        try await player.prepare(current: current, next: next)

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .paused)
        XCTAssertEqual(status.currentSource, current)
        XCTAssertEqual(status.nextSource, next)
        XCTAssertEqual(status.currentSourceDownload?.state, .localFile)
        XCTAssertEqual(status.currentSourceDownload?.resolvedFileURL, current.url)
        XCTAssertEqual(status.nextSourceDownload?.state, .localFile)
        XCTAssertEqual(status.nextSourceDownload?.resolvedFileURL, next.url)
    }

    func testStopAfterPrepareClearsPreparedState() async throws {
        let outputGraph = TestOutputGraph()
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let next = fixtureSource(id: "next", fixtureName: "gd77-s2t05-first-5s.mp3")

        try await player.prepare(current: current, next: next)
        await player.stop()

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .stopped)
        XCTAssertNil(player.latestPreparationReport)
        XCTAssertNil(status.currentSource)
        XCTAssertNil(status.nextSource)
    }

    func testPlaybackFinishedEmitsExactlyOneFinishedEventForEndOfQueue() async {
        let outputGraph = TestOutputGraph(currentTime: 4.9, isPlaying: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let capturedSessionID = "session-A"
        let recorder = EventRecorder()
        let finished = expectation(description: "finished event")

        player.callbackQueue = DispatchQueue(label: "GaplessMP3PlayerTests.finished")
        player.runtimeEventHandler = { event in
            recorder.append(event)
            finished.fulfill()
        }

        await player.testingSeedState(
            currentSource: current,
            nextSource: nil,
            playbackPhase: .playing,
            latestPreparationReport: makePreparationReport(current: current, next: nil),
            outputGraph: outputGraph,
            activePipelineSessionID: capturedSessionID
        )
        player.sessionID = "session-B"

        await player.testingHandlePlaybackFinished()
        await fulfillment(of: [finished], timeout: 1.0)
        try? await Task.sleep(nanoseconds: 100_000_000)

        let events = recorder.events
        XCTAssertEqual(events.count, 1)
        guard case let .playbackFinished(last, sessionID) = events[0] else {
            return XCTFail("Expected playbackFinished event")
        }
        XCTAssertEqual(last, current)
        XCTAssertEqual(sessionID, capturedSessionID)

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .stopped)
        XCTAssertEqual(status.currentSource, current)
    }

    func testPlaybackFinishedWithPendingTransitionEmitsOnlyTrackTransition() async {
        let outputGraph = TestOutputGraph(currentTime: 4.9, isPlaying: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let next = fixtureSource(id: "next", fixtureName: "gd77-s2t05-first-5s.mp3")
        let capturedSessionID = "session-A"
        let recorder = EventRecorder()
        let transitioned = expectation(description: "transition event")

        player.callbackQueue = DispatchQueue(label: "GaplessMP3PlayerTests.transition")
        player.runtimeEventHandler = { event in
            let count = recorder.append(event)
            if count == 1 {
                transitioned.fulfill()
            }
        }

        await player.testingSeedState(
            currentSource: current,
            nextSource: next,
            playbackPhase: .playing,
            latestPreparationReport: makePreparationReport(current: current, next: next),
            pendingTransitionReport: makePreparationReport(current: next, next: nil),
            pendingTransitionBoundaryTime: 5,
            outputGraph: outputGraph,
            activePipelineSessionID: capturedSessionID
        )

        outputGraph.setCurrentTime(5)
        player.sessionID = "session-B"
        await player.testingHandlePlaybackFinished()
        await fulfillment(of: [transitioned], timeout: 1.0)
        try? await Task.sleep(nanoseconds: 100_000_000)

        let events = recorder.events
        XCTAssertEqual(events.count, 1)
        guard case let .trackTransitioned(previous, currentAfterTransition, sessionID) = events[0] else {
            return XCTFail("Expected trackTransitioned event")
        }
        XCTAssertEqual(previous, current)
        XCTAssertEqual(currentAfterTransition, next)
        XCTAssertEqual(sessionID, capturedSessionID)

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .playing)
        XCTAssertEqual(status.currentSource, next)
        XCTAssertNil(status.nextSource)
    }

    func testStopSuppressesLatePlaybackFinishedEvent() async {
        let outputGraph = TestOutputGraph(currentTime: 5, isPlaying: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let lateFinished = expectation(description: "no late finished event")
        lateFinished.isInverted = true

        player.callbackQueue = DispatchQueue(label: "GaplessMP3PlayerTests.stop")
        player.runtimeEventHandler = { event in
            if case .playbackFinished = event {
                lateFinished.fulfill()
            }
        }

        await player.testingSeedState(
            currentSource: current,
            nextSource: nil,
            playbackPhase: .playing,
            latestPreparationReport: makePreparationReport(current: current, next: nil),
            outputGraph: outputGraph
        )

        await player.stop()
        await player.testingHandlePlaybackFinished()
        await fulfillment(of: [lateFinished], timeout: 0.2)

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .stopped)
        XCTAssertNil(status.currentSource)
        XCTAssertNil(status.nextSource)
    }

    func testSeekOnLocalFileCoversStartMiddleAndNearEndWithoutResumingPausedPlayback() async throws {
        let outputGraph = TestOutputGraph(currentTime: 0, isPlaying: false)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")

        try await player.prepare(current: current, next: nil)

        let initialStatus = await player.status()
        guard let duration = initialStatus.duration else {
            return XCTFail("Expected prepared duration")
        }

        try await player.seek(to: 0)
        let startStatus = await player.status()
        XCTAssertEqual(startStatus.currentTime, 0, accuracy: 0.05)
        XCTAssertEqual(startStatus.playbackPhase, .paused)
        XCTAssertFalse(outputGraph.isPlaying)

        let middleTarget = duration * 0.5
        try await player.seek(to: middleTarget)
        let middleStatus = await player.status()
        XCTAssertEqual(middleStatus.currentTime, middleTarget, accuracy: 0.05)
        XCTAssertEqual(middleStatus.playbackPhase, .paused)
        XCTAssertFalse(outputGraph.isPlaying)

        let nearEndTarget = duration * 0.99
        try await player.seek(to: nearEndTarget)
        let nearEndStatus = await player.status()
        XCTAssertEqual(nearEndStatus.currentTime, nearEndTarget, accuracy: 0.05)
        XCTAssertEqual(nearEndStatus.playbackPhase, .paused)
        XCTAssertFalse(outputGraph.isPlaying)
        XCTAssertEqual(nearEndStatus.currentSourceDownload?.state, .localFile)
        XCTAssertEqual(nearEndStatus.currentSourceDownload?.resolvedFileURL, current.url)
    }

    func testHTTPReadSessionUsesProgressiveBytesWhenSeekStaysInsideBufferedPrefix() async throws {
        let data = try httpFixtureData(named: "gd77-s2t07-first-5s.mp3")
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 4096)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "gd77-s2t07-first-5s.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 4096)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 1024,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true
        )
        let availability = try await readSession.read(maxLength: 512)

        guard case .available(let chunk) = availability else {
            return XCTFail("Expected progressive data for in-prefix seek")
        }

        XCTAssertEqual(chunk, data.subdata(in: 1024..<1536))
        let rangeHeaders = loader.recordedRangeHeaders()
        XCTAssertTrue(rangeHeaders.isEmpty)

        loader.finishProgressiveDownload()
    }

    func testHTTPSourceSessionShutdownCancelsPendingReadAndRemovesIncompleteTempFile() async throws {
        let data = try httpFixtureData(named: "gd77-s2t07-first-5s.mp3")
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2048)
        let cacheDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("HTTPSourceSessionShutdown-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: cacheDirectory) }

        let source = httpFixtureSource(id: "current", path: "gd77-s2t07-first-5s.mp3", byteCount: data.count)
        let cacheStore = SourceCacheStore(cacheDirectory: cacheDirectory, fileManager: .default)
        let downloadPaths = try cacheStore.makeDownloadPaths(for: source)
        var request = URLRequest(url: source.url)
        source.headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }

        let session = HTTPSourceSession(
            source: source,
            requestKind: .progressive,
            loader: loader,
            request: request,
            retryPolicy: .init(),
            cacheMode: .enabled,
            cacheStore: cacheStore,
            downloadPaths: downloadPaths,
            projector: SourceEventProjector(retryPolicy: .init())
        )

        await session.start()
        try await waitForDownloadedPrefix(session: session, minimum: 2048)
        XCTAssertTrue(FileManager.default.fileExists(atPath: downloadPaths.tempFileURL.path))

        let pendingRead = Task {
            try await session.read(offset: 4096, maxLength: 512)
        }
        try await Task.sleep(nanoseconds: 50_000_000)

        await session.shutdown()

        do {
            _ = try await pendingRead.value
            XCTFail("Expected pending read to be cancelled")
        } catch {
            XCTAssertTrue(error is CancellationError)
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: downloadPaths.tempFileURL.path))
    }

    func testMP3SourceManagerShutdownClearsInFlightDownloadStateAndTempFiles() async throws {
        let data = try httpFixtureData(named: "gd77-s2t07-first-5s.mp3")
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2048)
        let (sourceManager, cacheDirectory) = makeHTTPSourceManagerWithCacheDirectory(loader: loader)
        defer { try? FileManager.default.removeItem(at: cacheDirectory) }

        let source = httpFixtureSource(id: "current", path: "gd77-s2t07-first-5s.mp3", byteCount: data.count)
        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2048)

        let tempDirectory = cacheDirectory.appendingPathComponent("temp", isDirectory: true)
        let tempFilesBeforeShutdown = (try? FileManager.default.contentsOfDirectory(
            at: tempDirectory,
            includingPropertiesForKeys: nil
        )) ?? []
        XCTAssertEqual(tempFilesBeforeShutdown.count, 1)

        await sourceManager.shutdown()
        try await Task.sleep(nanoseconds: 100_000_000)

        let status = await sourceManager.downloadStatus(for: source)
        XCTAssertEqual(status?.state, .idle)
        XCTAssertEqual(status?.downloadedBytes, 0)
        XCTAssertEqual(status?.expectedBytes, Int64(data.count))

        let tempFilesAfterShutdown = (try? FileManager.default.contentsOfDirectory(
            at: tempDirectory,
            includingPropertiesForKeys: nil
        )) ?? []
        XCTAssertTrue(tempFilesAfterShutdown.isEmpty)
    }

    func testHTTPReadSessionUsesRangeRequestWhenSeekJumpsBeyondBufferedPrefix() async throws {
        let data = try httpFixtureData(named: "gd77-s2t07-first-5s.mp3")
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "gd77-s2t07-first-5s.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2048)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 4096,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true
        )
        let availability = try await readSession.read(maxLength: 512)

        guard case .available(let chunk) = availability else {
            return XCTFail("Expected ranged data for far seek")
        }

        XCTAssertEqual(chunk, data.subdata(in: 4096..<4608))
        let rangeHeaders = loader.recordedRangeHeaders()
        XCTAssertEqual(rangeHeaders, ["bytes=4096-4607"])

        loader.finishProgressiveDownload()
    }

    func testPlaybackNormalizesScheduledOutputAcrossMixedTrackFormats() async throws {
        let outputGraph = TestOutputGraph(advanceTimeOnSchedule: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let next = fixtureSource(id: "next", fixtureName: "gd77-s2t07-first-5s-44k1-stereo.mp3")

        try await player.prepare(current: current, next: next)
        let initialReport = try XCTUnwrap(player.latestPreparationReport)
        let expectedDuration = initialReport.current.trimmedDuration + (initialReport.next?.trimmedDuration ?? 0)
        XCTAssertTrue(player.play())

        for _ in 0..<200 {
            if outputGraph.totalScheduledDuration() >= expectedDuration - 0.1 {
                break
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }

        let scheduledChunks = outputGraph.scheduledChunksSnapshot()
        XCTAssertFalse(scheduledChunks.isEmpty)
        XCTAssertTrue(scheduledChunks.allSatisfy { $0.sampleRate == 44_100 })
        XCTAssertTrue(scheduledChunks.allSatisfy { $0.channelCount == 2 })
        XCTAssertEqual(outputGraph.totalScheduledDuration(), expectedDuration, accuracy: 0.1)
    }

    private func makePlayer(outputGraph: TestOutputGraph) -> GaplessMP3Player {
        let cacheDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("GaplessMP3PlayerTests-\(UUID().uuidString)", isDirectory: true)
        let sourceManager = MP3SourceManager(cacheDirectory: cacheDirectory)
        return GaplessMP3Player(
            sourceManager: sourceManager,
            outputGraphFactory: { _, _ in outputGraph }
        )
    }

    private func fixtureSource(id: String, fixtureName: String) -> GaplessPlaybackSource {
        let url = Bundle.module.bundleURL
            .appendingPathComponent("Fixtures")
            .appendingPathComponent(fixtureName)
        return GaplessPlaybackSource(
            id: id,
            url: url,
            cacheKey: fixtureName,
            expectedContentLength: fileSize(at: url)
        )
    }

    private func makeHTTPSourceManager(loader: some HTTPDataLoading) -> MP3SourceManager {
        makeHTTPSourceManagerWithCacheDirectory(loader: loader).manager
    }

    private func makeHTTPSourceManagerWithCacheDirectory(loader: some HTTPDataLoading) -> (manager: MP3SourceManager, cacheDirectory: URL) {
        let cacheDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("GaplessMP3PlayerHTTPTests-\(UUID().uuidString)", isDirectory: true)
        return (
            MP3SourceManager(cacheDirectory: cacheDirectory, loader: loader),
            cacheDirectory
        )
    }

    private func httpFixtureSource(id: String, path: String, byteCount: Int) -> GaplessPlaybackSource {
        GaplessPlaybackSource(
            id: id,
            url: URL(string: "https://example.test/\(path)")!,
            cacheKey: path,
            expectedContentLength: Int64(byteCount)
        )
    }

    private func httpFixtureData(named fixtureName: String) throws -> Data {
        let url = Bundle.module.bundleURL
            .appendingPathComponent("Fixtures")
            .appendingPathComponent(fixtureName)
        return try Data(contentsOf: url)
    }

    private func waitForDownloadedBytes(
        sourceManager: MP3SourceManager,
        source: GaplessPlaybackSource,
        minimum: Int64
    ) async throws {
        for _ in 0..<100 {
            if let status = await sourceManager.downloadStatus(for: source),
               status.downloadedBytes >= minimum {
                return
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Timed out waiting for \(minimum) downloaded bytes")
    }

    private func waitForDownloadedPrefix(
        session: HTTPSourceSession,
        minimum: Int64
    ) async throws {
        for _ in 0..<100 {
            if await session.contiguousPrefixEnd() >= minimum {
                return
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Timed out waiting for \(minimum) downloaded bytes")
    }

    private func fileSize(at url: URL) -> Int64? {
        let values = try? url.resourceValues(forKeys: [.fileSizeKey])
        return values?.fileSize.map(Int64.init)
    }

    private func makePreparationReport(
        current: GaplessPlaybackSource,
        next: GaplessPlaybackSource?
    ) -> GaplessPreparationReport {
        let currentTrack = GaplessPreparationReport.TrackReport(
            source: current,
            metadata: makeMetadata(for: current),
            trimmedDuration: 5
        )
        let nextTrack = next.map {
            GaplessPreparationReport.TrackReport(
                source: $0,
                metadata: makeMetadata(for: $0),
                trimmedDuration: 5
            )
        }
        return GaplessPreparationReport(
            current: currentTrack,
            next: nextTrack,
            sampleRate: 44_100,
            outputChannelCount: 2,
            transitionIsContinuous: nextTrack != nil
        )
    }

    private func makeMetadata(for source: GaplessPlaybackSource) -> MP3TrackMetadata {
        MP3TrackMetadata(
            sourceID: source.id,
            sourceURL: source.url,
            cacheKey: source.cacheKey,
            fingerprint: CacheFingerprint(contentLength: source.expectedContentLength),
            firstAudioFrameOffset: 0,
            dataStartOffset: 0,
            dataEndOffset: nil,
            seekHeaderKind: .xing,
            sampleRate: 48_000,
            channelCount: 2,
            samplesPerFrame: 1152,
            durationUs: 5_000_000,
            encoderDelayFrames: 0,
            encoderPaddingFrames: 0
        )
    }
}

private final class StubHTTPDataLoader: HTTPDataLoading, @unchecked Sendable {
    private let data: Data
    private let initialProgressiveChunkSize: Int
    private let stateQueue = DispatchQueue(label: "StubHTTPDataLoader.state")
    private var progressiveContinuation: AsyncThrowingStream<HTTPDownloadEvent, Error>.Continuation?
    private var progressiveDidFinish = false
    private var rangeHeaders: [String] = []

    init(data: Data, initialProgressiveChunkSize: Int) {
        self.data = data
        self.initialProgressiveChunkSize = min(max(initialProgressiveChunkSize, 0), data.count)
    }

    func progressiveDownload(
        for request: URLRequest,
        retryPolicy _: GaplessHTTPRetryPolicy,
        eventHandler _: (@Sendable (HTTPTransportLogEvent) -> Void)?
    ) -> AsyncThrowingStream<HTTPDownloadEvent, Error> {
        AsyncThrowingStream { continuation in
            let response = self.makeResponse(for: request, range: nil, contentLength: Int64(self.data.count))
            let initialChunk = self.data.prefix(self.initialProgressiveChunkSize)
            self.stateQueue.sync {
                self.progressiveContinuation = continuation
            }
            continuation.yield(.response(response, restartFromZero: false))
            if !initialChunk.isEmpty {
                continuation.yield(.bytes(Data(initialChunk)))
            }
        }
    }

    func rangeRequest(
        for request: URLRequest,
        retryPolicy _: GaplessHTTPRetryPolicy,
        eventHandler _: (@Sendable (HTTPTransportLogEvent) -> Void)?
    ) async throws -> RangeReadResult {
        let header = request.value(forHTTPHeaderField: "Range") ?? ""
        stateQueue.sync {
            rangeHeaders.append(header)
        }
        let (start, end) = try parseRangeHeader(header, totalBytes: data.count)
        return RangeReadResult(
            data: data.subdata(in: start..<(end + 1)),
            fingerprint: CacheFingerprint(contentLength: Int64(data.count))
        )
    }

    func finishProgressiveDownload() {
        let continuation: AsyncThrowingStream<HTTPDownloadEvent, Error>.Continuation? = stateQueue.sync {
            guard !progressiveDidFinish else {
                return nil
            }
            progressiveDidFinish = true
            return progressiveContinuation
        }
        guard let continuation else {
            return
        }
        if initialProgressiveChunkSize < data.count {
            continuation.yield(.bytes(Data(data.dropFirst(initialProgressiveChunkSize))))
        }
        continuation.yield(.completed)
        continuation.finish()
    }

    func recordedRangeHeaders() -> [String] {
        stateQueue.sync { rangeHeaders }
    }

    private func makeResponse(for request: URLRequest, range: ClosedRange<Int>?, contentLength: Int64) -> HTTPURLResponse {
        var headers = ["Content-Type": "audio/mpeg", "Content-Length": "\(contentLength)"]
        let statusCode: Int
        if let range {
            headers["Content-Range"] = "bytes \(range.lowerBound)-\(range.upperBound)/\(data.count)"
            statusCode = 206
        } else {
            statusCode = 200
        }
        return HTTPURLResponse(url: request.url!, statusCode: statusCode, httpVersion: "HTTP/1.1", headerFields: headers)!
    }

    private func parseRangeHeader(_ header: String, totalBytes: Int) throws -> (Int, Int) {
        guard header.hasPrefix("bytes=") else {
            throw TestFailure.invalidRangeHeader(header)
        }
        let rawRange = header.dropFirst("bytes=".count)
        let parts = rawRange.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2,
              let start = Int(parts[0]),
              let end = Int(parts[1]),
              start >= 0,
              end >= start,
              end < totalBytes else {
            throw TestFailure.invalidRangeHeader(header)
        }
        return (start, end)
    }
}

private enum TestFailure: Error {
    case invalidRangeHeader(String)
}

private final class TestOutputGraph: PCMOutputControlling, @unchecked Sendable {
    private let lock = NSLock()
    private let advanceTimeOnSchedule: Bool
    private var timelineOffset: TimeInterval
    private var playing: Bool
    private var outputVolume: Float = 1.0
    private var scheduledChunks: [PCMChunk] = []

    init(currentTime: TimeInterval = 0, isPlaying: Bool = false, advanceTimeOnSchedule: Bool = false) {
        self.advanceTimeOnSchedule = advanceTimeOnSchedule
        self.timelineOffset = currentTime
        self.playing = isPlaying
    }

    var isPlaying: Bool {
        lock.lock()
        defer { lock.unlock() }
        return playing
    }

    var volume: Float {
        get {
            lock.lock()
            defer { lock.unlock() }
            return outputVolume
        }
        set {
            lock.lock()
            defer { lock.unlock() }
            outputVolume = newValue
        }
    }

    func reset(timelineOffset: TimeInterval) {
        lock.lock()
        defer { lock.unlock() }
        self.timelineOffset = timelineOffset
        scheduledChunks = []
    }

    func setCurrentTime(_ time: TimeInterval) {
        lock.lock()
        defer { lock.unlock() }
        timelineOffset = time
    }

    func requestPlay() {
        lock.lock()
        defer { lock.unlock() }
        playing = true
    }

    func schedule(_ chunk: PCMChunk) throws {
        lock.lock()
        defer { lock.unlock() }
        scheduledChunks.append(chunk)
        if advanceTimeOnSchedule {
            timelineOffset += Double(chunk.frameCount) / chunk.sampleRate
        }
    }

    func pause() {
        lock.lock()
        defer { lock.unlock() }
        playing = false
    }

    func markDecodeFinished() {}

    func currentTime() -> TimeInterval {
        lock.lock()
        defer { lock.unlock() }
        return timelineOffset
    }

    func scheduledChunksSnapshot() -> [PCMChunk] {
        lock.lock()
        defer { lock.unlock() }
        return scheduledChunks
    }

    func totalScheduledDuration() -> TimeInterval {
        lock.lock()
        defer { lock.unlock() }
        return scheduledChunks.reduce(0) { $0 + (Double($1.frameCount) / $1.sampleRate) }
    }
}

private final class EventRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [GaplessRuntimeEvent] = []

    var events: [GaplessRuntimeEvent] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }

    @discardableResult
    func append(_ event: GaplessRuntimeEvent) -> Int {
        lock.lock()
        defer { lock.unlock() }
        storage.append(event)
        return storage.count
    }
}
