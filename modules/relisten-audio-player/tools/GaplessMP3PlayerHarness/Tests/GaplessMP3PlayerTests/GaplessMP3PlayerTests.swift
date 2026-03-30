import Foundation
import XCTest
@testable import GaplessMP3Player

final class GaplessMP3PlayerTests: XCTestCase {
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
            outputGraph: outputGraph
        )

        await player.testingHandlePlaybackFinished()
        await fulfillment(of: [finished], timeout: 1.0)
        try? await Task.sleep(nanoseconds: 100_000_000)

        let events = recorder.events
        XCTAssertEqual(events.count, 1)
        guard case let .playbackFinished(last) = events[0] else {
            return XCTFail("Expected playbackFinished event")
        }
        XCTAssertEqual(last, current)

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .stopped)
        XCTAssertEqual(status.currentSource, current)
    }

    func testPlaybackFinishedWithPendingTransitionEmitsOnlyTrackTransition() async {
        let outputGraph = TestOutputGraph(currentTime: 4.9, isPlaying: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let next = fixtureSource(id: "next", fixtureName: "gd77-s2t05-first-5s.mp3")
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
            outputGraph: outputGraph
        )

        outputGraph.setCurrentTime(5)
        await player.testingHandlePlaybackFinished()
        await fulfillment(of: [transitioned], timeout: 1.0)
        try? await Task.sleep(nanoseconds: 100_000_000)

        let events = recorder.events
        XCTAssertEqual(events.count, 1)
        guard case let .trackTransitioned(previous, currentAfterTransition) = events[0] else {
            return XCTFail("Expected trackTransitioned event")
        }
        XCTAssertEqual(previous, current)
        XCTAssertEqual(currentAfterTransition, next)

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
            sampleRate: 48_000,
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

private final class TestOutputGraph: PCMOutputControlling, @unchecked Sendable {
    private let lock = NSLock()
    private var timelineOffset: TimeInterval
    private var playing: Bool
    private var outputVolume: Float = 1.0

    init(currentTime: TimeInterval = 0, isPlaying: Bool = false) {
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

    func schedule(_ chunk: PCMChunk) throws {}

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
