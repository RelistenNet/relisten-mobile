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

    func testParserEstimatesDurationAndSeekOffsetForCBRTrackWithoutSeekHeader() throws {
        let data = makeCBRMP3Data(frameCount: 512, bitrateKbps: 192)
        let source = httpFixtureSource(id: "current", path: "cbr-without-seek-header.mp3", byteCount: data.count)

        let metadata = try MP3GaplessMetadataParser().parse(
            source: source,
            data: data,
            fingerprint: CacheFingerprint(contentLength: Int64(data.count))
        )

        XCTAssertEqual(metadata.seekHeaderKind, .none)
        XCTAssertEqual(metadata.approximateSeekStrategy, .constantBitrate)
        XCTAssertEqual(metadata.durationUs, (Int64(data.count) * 8 * 1_000_000) / 192_000)
        XCTAssertEqual(metadata.dataEndOffset, Int64(data.count - 1))
        let duration = try XCTUnwrap(metadata.durationUs).secondsFromMicroseconds

        let seekPlan = TrackSeekPlanner.plan(metadata: metadata, startTime: duration * 0.5)
        let expectedMidpointOffset = try XCTUnwrap(expectedCBRSeekByteOffset(metadata: metadata, startTime: duration * 0.5))
        XCTAssertLessThanOrEqual(abs(seekPlan.byteOffset - expectedMidpointOffset), 8)
    }

    func testParserDoesNotEstimateDurationForNonCBRTrackWithoutSeekHeader() throws {
        var data = try httpFixtureData(named: "gd77-s2t07-first-5s-44k1-stereo.mp3")
        try replaceFirstASCII("Info", with: "Junk", in: &data)
        let source = httpFixtureSource(id: "current", path: "vbr-without-seek-header.mp3", byteCount: data.count)

        let metadata = try MP3GaplessMetadataParser().parse(
            source: source,
            data: data,
            fingerprint: CacheFingerprint(contentLength: Int64(data.count))
        )

        XCTAssertEqual(metadata.seekHeaderKind, .none)
        XCTAssertEqual(metadata.approximateSeekStrategy, .unavailable)
        XCTAssertNil(metadata.durationUs)
    }

    func testParserDoesNotEstimateDurationWhenNoHeaderTrackChangesBitrateAfterIntro() throws {
        let introBitrates = Array(repeating: 192, count: 40)
        let laterBitrates = Array(repeating: 128, count: 32)
        let data = makeMP3Data(frameBitratesKbps: introBitrates + laterBitrates)
        let source = httpFixtureSource(id: "current", path: "delayed-vbr-without-seek-header.mp3", byteCount: data.count)

        let metadata = try MP3GaplessMetadataParser().parse(
            source: source,
            data: data,
            fingerprint: CacheFingerprint(contentLength: Int64(data.count))
        )

        XCTAssertEqual(metadata.seekHeaderKind, .none)
        XCTAssertEqual(metadata.approximateSeekStrategy, .unavailable)
        XCTAssertNil(metadata.durationUs)
    }

    func testParserDoesNotEstimateDurationFromXingHeaderWithoutFrameCount() throws {
        let data = makeCBRMP3Data(frameCount: 512, bitrateKbps: 192, xingDataSizeOnly: true)
        let source = httpFixtureSource(id: "current", path: "xing-without-frame-count.mp3", byteCount: data.count)

        let metadata = try MP3GaplessMetadataParser().parse(
            source: source,
            data: data,
            fingerprint: CacheFingerprint(contentLength: Int64(data.count))
        )

        XCTAssertEqual(metadata.seekHeaderKind, .xing)
        XCTAssertEqual(metadata.approximateSeekStrategy, .unavailable)
        XCTAssertNil(metadata.durationUs)
        XCTAssertEqual(metadata.dataEndOffset, Int64(data.count - 1))
    }

    func testCBRSeekPlannerUsesBitrateForPaddedFrames() throws {
        let source = phishSimple19961118Source()
        let metadata = MP3TrackMetadata(
            sourceID: source.id,
            sourceURL: source.url,
            cacheKey: source.cacheKey,
            fingerprint: CacheFingerprint(contentLength: source.expectedContentLength),
            firstAudioFrameOffset: 205_375,
            dataStartOffset: 205_375,
            dataEndOffset: 24_481_198,
            seekHeaderKind: .none,
            sampleRate: 44_100,
            channelCount: 2,
            samplesPerFrame: 1_152,
            firstFrameByteLength: 626,
            estimatedBitrate: 192_000,
            approximateSeekStrategy: .constantBitrate,
            durationUs: 1_011_492_666,
            encoderDelayFrames: 0,
            encoderPaddingFrames: 0
        )

        let seekPlan = TrackSeekPlanner.plan(metadata: metadata, startTime: 657)

        XCTAssertLessThanOrEqual(abs(seekPlan.byteOffset - 15_972_258), 8)
    }

    func testSeekPlannerDoesNotUseCBRForXingDurationWithoutToc() {
        let source = httpFixtureSource(id: "current", path: "xing-without-toc.mp3", byteCount: 250_000)
        let metadata = MP3TrackMetadata(
            sourceID: source.id,
            sourceURL: source.url,
            cacheKey: source.cacheKey,
            fingerprint: CacheFingerprint(contentLength: source.expectedContentLength),
            firstAudioFrameOffset: 1_000,
            dataStartOffset: 1_000,
            dataEndOffset: 249_999,
            seekHeaderKind: .xing,
            sampleRate: 44_100,
            channelCount: 2,
            samplesPerFrame: 1_152,
            firstFrameByteLength: 626,
            estimatedBitrate: 192_000,
            durationUs: 10_000_000,
            encoderDelayFrames: 0,
            encoderPaddingFrames: 0,
            xingToc: nil
        )

        let seekPlan = TrackSeekPlanner.plan(metadata: metadata, startTime: 5)

        XCTAssertEqual(seekPlan.byteOffset, metadata.dataStartOffset)
    }

    func testE2EPhishSimple19961118FarSeekDoesNotClampToBeginning() async throws {
        try requireLiveAudioE2E()
        let outputGraph = TestOutputGraph()
        let httpLogRecorder = HTTPLogRecorder()
        let player = makeHTTPPlayer(outputGraph: outputGraph, cacheMode: .disabled)
        player.httpLogHandler = { event in
            httpLogRecorder.record(event)
        }
        let source = phishSimple19961118Source()
        let targetTime: TimeInterval = (10 * 60) + 57

        try await player.prepare(current: source, next: nil)

        let report = try XCTUnwrap(player.latestPreparationReport)
        XCTAssertEqual(report.current.metadata.seekHeaderKind, .none)
        XCTAssertGreaterThan(report.current.trimmedDuration, targetTime)

        try await player.seek(to: targetTime)

        let seekedStatus = await player.status()
        XCTAssertEqual(seekedStatus.currentTime, targetTime, accuracy: 1)

        XCTAssertTrue(player.play())
        try await waitUntil("far-seek audio schedules from live Phish Simple file", timeoutIterations: 300) {
            outputGraph.totalScheduledDuration() > 1
        }
        let rangeStart = try XCTUnwrap(firstRangeRequestStart(in: httpLogRecorder.events()))
        XCTAssertLessThanOrEqual(abs(rangeStart - 15_972_258), 2_048)
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

    func testTrackBoundaryCallbackEmitsExactlyOneFinishedEventForEndOfQueue() async {
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
        let boundaryCallbackID = await player.testingRegisterScheduledTrackBoundary(sourceID: current.id)
        player.sessionID = "session-B"

        await player.testingHandleTrackBoundaryPlayedBack(
            callbackID: boundaryCallbackID,
            sourceID: current.id,
            sessionID: capturedSessionID
        )
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
        XCTAssertFalse(status.isPlaying)
    }

    func testTrackBoundaryCallbackWithPendingTransitionEmitsOnlyTrackTransition() async {
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
        let boundaryCallbackID = await player.testingRegisterScheduledTrackBoundary(sourceID: current.id)
        player.sessionID = "session-B"
        await player.testingHandleTrackBoundaryPlayedBack(
            callbackID: boundaryCallbackID,
            sourceID: current.id,
            sessionID: capturedSessionID
        )
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
        XCTAssertEqual(status.currentTime, 0, accuracy: 0.01)
    }

    func testPausedStatusDoesNotAdvanceToOutputGraphBoundary() async throws {
        let outputGraph = TestOutputGraph(currentTime: 2.25, isPlaying: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let next = fixtureSource(id: "next", fixtureName: "gd77-s2t05-first-5s.mp3")

        await player.testingSeedState(
            currentSource: current,
            nextSource: next,
            playbackPhase: .playing,
            latestPreparationReport: makePreparationReport(current: current, next: next),
            pendingTransitionReport: makePreparationReport(current: next, next: nil),
            pendingTransitionBoundaryTime: 5,
            outputGraph: outputGraph
        )

        player.pause()
        try await waitUntil("pause command") {
            !outputGraph.isPlaying
        }

        outputGraph.setCurrentTime(5)
        let status = await player.status()

        XCTAssertEqual(status.playbackPhase, .paused)
        XCTAssertEqual(status.currentSource, current)
        XCTAssertEqual(status.nextSource, next)
        XCTAssertEqual(status.currentTime, 2.25, accuracy: 0.01)
    }

    func testPlayReportsFailureWhenOutputGraphCannotResume() async throws {
        let outputGraph = TestOutputGraph(
            requestPlayError: GaplessMP3PlayerError.audioPipeline("Could not restart output engine")
        )
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let recorder = EventRecorder()
        let failed = expectation(description: "playback failure event")

        player.callbackQueue = DispatchQueue(label: "GaplessMP3PlayerTests.outputGraphFailure")
        player.runtimeEventHandler = { event in
            if case .playbackFailed = event {
                failed.fulfill()
            }
            recorder.append(event)
        }

        try await player.prepare(current: current, next: nil)
        XCTAssertTrue(player.play())

        await fulfillment(of: [failed], timeout: 1.0)
        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .failed)
        XCTAssertEqual(status.playbackFailure?.kind, .audioPipeline)

        let events = recorder.events
        XCTAssertEqual(events.count, 1)
        guard case let .playbackFailed(failure, _) = events[0] else {
            return XCTFail("Expected playbackFailed event")
        }
        XCTAssertEqual(failure.kind, .audioPipeline)
    }

    func testPlayWhileAlreadyPlayingDoesNotResetToRequestedStartTime() async throws {
        let outputGraph = TestOutputGraph(currentTime: 4, isPlaying: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")

        await player.testingSeedState(
            currentSource: current,
            nextSource: nil,
            playbackPhase: .playing,
            latestPreparationReport: makePreparationReport(current: current, next: nil),
            requestedStartTime: 2.25,
            outputGraph: outputGraph
        )

        XCTAssertTrue(player.play())
        try await Task.sleep(nanoseconds: 50_000_000)

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .playing)
        XCTAssertEqual(status.currentSource, current)
        XCTAssertEqual(status.currentTime, 4, accuracy: 0.05)
    }

    func testSetNextAfterPlayStillTransitionsAtTrackBoundary() async throws {
        let outputGraph = TestOutputGraph()
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let next = fixtureSource(id: "next", fixtureName: "gd77-s2t05-first-5s.mp3")
        let recorder = EventRecorder()
        let transitioned = expectation(description: "late setNext transition event")

        player.callbackQueue = DispatchQueue(label: "GaplessMP3PlayerTests.setNextAfterPlay")
        player.runtimeEventHandler = { event in
            let count = recorder.append(event)
            if case .trackTransitioned = event, count >= 1 {
                transitioned.fulfill()
            }
        }

        try await player.prepare(current: current, next: nil)
        XCTAssertTrue(player.play())
        try await waitUntil("current playback scheduling") {
            outputGraph.totalScheduledDuration() > 0
        }
        try await player.setNext(next)
        outputGraph.setCurrentTime(4.9)

        var boundaryCallbackID: UUID?
        for _ in 0..<100 {
            if let callbackID = await player.testingScheduledTrackBoundaryCallbackID(sourceID: current.id) {
                boundaryCallbackID = callbackID
                break
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        let resolvedBoundaryCallbackID = try XCTUnwrap(
            boundaryCallbackID,
            "Expected current-track boundary callback"
        )
        await player.testingHandleTrackBoundaryPlayedBack(
            callbackID: resolvedBoundaryCallbackID,
            sourceID: current.id
        )
        await fulfillment(of: [transitioned], timeout: 1.0)
        try? await Task.sleep(nanoseconds: 100_000_000)

        let events = recorder.events
        XCTAssertFalse(events.isEmpty)
        guard case let .trackTransitioned(previous, currentAfterTransition, _) = events[0] else {
            return XCTFail("Expected trackTransitioned event after setNext during playback")
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

    func testStopSuppressesLateTrackBoundaryCallback() async {
        let outputGraph = TestOutputGraph(currentTime: 5, isPlaying: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let lateFinished = expectation(description: "no late boundary finished event")
        lateFinished.isInverted = true

        player.callbackQueue = DispatchQueue(label: "GaplessMP3PlayerTests.stopBoundary")
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
            outputGraph: outputGraph,
            activePipelineSessionID: "session-A"
        )
        let boundaryCallbackID = await player.testingRegisterScheduledTrackBoundary(sourceID: current.id)

        await player.stop()
        await player.testingHandleTrackBoundaryPlayedBack(
            callbackID: boundaryCallbackID,
            sourceID: current.id,
            sessionID: "session-A"
        )
        await fulfillment(of: [lateFinished], timeout: 0.2)

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .stopped)
        XCTAssertNil(status.currentSource)
        XCTAssertNil(status.nextSource)
    }

    func testPlaybackFailureEmitsTypedRuntimeFailureAndStatus() async {
        let outputGraph = TestOutputGraph(currentTime: 1.25, isPlaying: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let recorder = EventRecorder()
        let failed = expectation(description: "playback failure")

        player.callbackQueue = DispatchQueue(label: "GaplessMP3PlayerTests.failure")
        player.runtimeEventHandler = { event in
            recorder.append(event)
            failed.fulfill()
        }

        await player.testingSeedState(
            currentSource: current,
            nextSource: nil,
            playbackPhase: .playing,
            latestPreparationReport: makePreparationReport(current: current, next: nil),
            outputGraph: outputGraph,
            activePipelineSessionID: "session-A"
        )

        await player.testingHandlePlaybackFailure(GaplessMP3PlayerError.invalidMP3("Missing MPEG sync"))
        await fulfillment(of: [failed], timeout: 1.0)
        try? await Task.sleep(nanoseconds: 100_000_000)

        let events = recorder.events
        XCTAssertEqual(events.count, 1)
        guard case let .playbackFailed(failure, sessionID) = events[0] else {
            return XCTFail("Expected playbackFailed event")
        }
        XCTAssertEqual(failure.kind, .invalidMedia)
        XCTAssertEqual(failure.message, "Invalid media file")
        XCTAssertEqual(sessionID, "session-A")

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .failed)
        XCTAssertEqual(status.playbackFailure?.kind, .invalidMedia)
        XCTAssertEqual(status.playbackFailure?.message, "Invalid media file")
    }

    func testPlaybackFailureSuppressesCancellationError() async {
        let outputGraph = TestOutputGraph(currentTime: 1.0, isPlaying: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")
        let cancelled = expectation(description: "no cancellation event")
        cancelled.isInverted = true

        player.callbackQueue = DispatchQueue(label: "GaplessMP3PlayerTests.cancelled")
        player.runtimeEventHandler = { event in
            if case .playbackFailed = event {
                cancelled.fulfill()
            }
        }

        await player.testingSeedState(
            currentSource: current,
            nextSource: nil,
            playbackPhase: .playing,
            latestPreparationReport: makePreparationReport(current: current, next: nil),
            outputGraph: outputGraph,
            activePipelineSessionID: "session-A"
        )

        await player.testingHandlePlaybackFailure(CancellationError())
        await fulfillment(of: [cancelled], timeout: 0.2)

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .playing)
        XCTAssertNil(status.playbackFailure)
    }

    func testPlaybackFailureTranslationCoversGaplessTransportUrlAndFileErrors() {
        XCTAssertEqual(
            GaplessPlaybackFailure.make(from: GaplessMP3PlayerError.unsupportedSourceScheme("ftp"))?.kind,
            .invalidSource
        )
        XCTAssertEqual(
            GaplessPlaybackFailure.make(from: URLError(.notConnectedToInternet))?.kind,
            .networkUnavailable
        )
        XCTAssertEqual(
            GaplessPlaybackFailure.make(from: URLError(.secureConnectionFailed))?.kind,
            .sslFailure
        )
        XCTAssertEqual(
            GaplessPlaybackFailure.make(from: HTTPTransportError.unexpectedStatus(503))?.kind,
            .httpStatus
        )
        XCTAssertEqual(
            GaplessPlaybackFailure.make(from: HTTPTransportError.unexpectedStatus(503))?.httpStatus,
            503
        )
        XCTAssertEqual(
            GaplessPlaybackFailure.make(
                from: NSError(
                    domain: NSCocoaErrorDomain,
                    code: NSFileNoSuchFileError,
                    userInfo: [NSLocalizedDescriptionKey: "missing file"]
                )
            )?.kind,
            .sourceNotFound
        )
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

    func testSeekWhilePlayingRestartsPipelineAfterGraphReset() async throws {
        let outputGraph = TestOutputGraph(advanceTimeOnSchedule: true)
        let player = makePlayer(outputGraph: outputGraph)
        let current = fixtureSource(id: "current", fixtureName: "gd77-s2t07-first-5s.mp3")

        try await player.prepare(current: current, next: nil)
        let preparedStatus = await player.status()
        let duration = try XCTUnwrap(preparedStatus.duration)
        XCTAssertTrue(player.play())

        try await waitUntil("initial playback schedules audio") {
            outputGraph.totalScheduledDuration() > 0
        }

        try await player.seek(to: duration * 0.5)

        try await waitUntil("seek restarts audio scheduling") {
            outputGraph.totalScheduledDuration() > 0
        }

        let status = await player.status()
        XCTAssertEqual(status.playbackPhase, .playing)
        XCTAssertTrue(status.isPlaying)
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
            allowsParallelRangeRequests: true,
            readIntent: .seekStart
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

    func testHTTPReadSessionUsesProgressiveBytesForNormalStartBeyondBufferedPrefix() async throws {
        let data = makeHTTPTestData(byteCount: 2 * 1_024 * 1_024)
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2_048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "normal-start.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_048)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 4_096,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true,
            readIntent: .normalStart
        )

        Task {
            try? await Task.sleep(nanoseconds: 50_000_000)
            loader.appendProgressiveBytes(upTo: 8_192)
        }

        let availability = try await readSession.read(maxLength: 512)
        guard case .available(let chunk) = availability else {
            return XCTFail("Expected progressive data for normal startup")
        }

        XCTAssertEqual(chunk, data.subdata(in: 4_096..<4_608))
        XCTAssertTrue(loader.recordedRangeHeaders().isEmpty)
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

    func testPlayerInitWipesPreviousSessionCacheDirectory() async {
        let cacheDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("GaplessMP3PlayerCacheWipe-\(UUID().uuidString)", isDirectory: true)
        let indexDirectory = cacheDirectory.appendingPathComponent("index", isDirectory: true)
        let tempDirectory = cacheDirectory.appendingPathComponent("temp", isDirectory: true)
        try? FileManager.default.createDirectory(at: indexDirectory, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        let cachedFile = cacheDirectory.appendingPathComponent("stable.mp3")
        let cachedIndex = indexDirectory.appendingPathComponent("stable.json")
        let staleTempFile = tempDirectory.appendingPathComponent("stale.download")
        FileManager.default.createFile(atPath: cachedFile.path, contents: Data("cached".utf8))
        FileManager.default.createFile(atPath: cachedIndex.path, contents: Data("index".utf8))
        FileManager.default.createFile(atPath: staleTempFile.path, contents: Data("stale".utf8))
        XCTAssertTrue(FileManager.default.fileExists(atPath: cachedFile.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: cachedIndex.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: staleTempFile.path))

        let player = GaplessMP3Player(cacheDirectory: cacheDirectory)
        XCTAssertFalse(FileManager.default.fileExists(atPath: cachedFile.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: cachedIndex.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: staleTempFile.path))

        await player.teardown()
        try? FileManager.default.removeItem(at: cacheDirectory)
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

    func testMP3SourceManagerDeduplicatesConcurrentPreloadOpens() async throws {
        let data = makeHTTPTestData(byteCount: 512 * 1_024)
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2_048)
        let (sourceManager, cacheDirectory) = makeHTTPSourceManagerWithCacheDirectory(loader: loader)
        defer { try? FileManager.default.removeItem(at: cacheDirectory) }

        let source = httpFixtureSource(id: "current", path: "concurrent-open.mp3", byteCount: data.count)

        async let first: Void = sourceManager.preload(source)
        async let second: Void = sourceManager.preload(source)
        async let third: Void = sourceManager.preload(source)
        _ = try await (first, second, third)

        XCTAssertEqual(loader.progressiveDownloadInvocationCount(), 1)

        await sourceManager.shutdown()
    }

    func testMetadataLoadPromotesSharedSessionInsteadOfStartingSecondProgressiveDownload() async throws {
        let data = try httpFixtureData(named: "gd77-s2t07-first-5s.mp3")
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: data.count)
        let (sourceManager, cacheDirectory) = makeHTTPSourceManagerWithCacheDirectory(loader: loader)
        defer { try? FileManager.default.removeItem(at: cacheDirectory) }

        let source = httpFixtureSource(id: "next", path: "shared-session.mp3", byteCount: data.count)
        let logRecorder = HTTPLogRecorder()
        await sourceManager.setHTTPLogHandler { event in
            logRecorder.record(event)
        }

        _ = try await sourceManager.metadataData(for: source)
        XCTAssertEqual(loader.progressiveDownloadInvocationCount(), 1)

        try await sourceManager.preload(source)
        XCTAssertEqual(loader.progressiveDownloadInvocationCount(), 1)

        let events = logRecorder.events()
        XCTAssertTrue(
            events.contains(where: {
                $0.kind == .requestPromoted &&
                    $0.sourceID == source.id &&
                    $0.previousRequestKind == .metadata &&
                    $0.requestKind == .progressive
            })
        )

        loader.finishProgressiveDownload()
        _ = try await waitForDownloadState(
            sourceManager: sourceManager,
            source: source,
            matcher: { $0.state == .completed || $0.state == .cached }
        )
        await sourceManager.shutdown()
    }

    func testHTTPReadSessionUsesSingleBridgeWindowForFarSeek() async throws {
        let data = makeHTTPTestData(byteCount: 3 * 1_024 * 1_024)
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2_048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "far-seek.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_048)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 1_024 * 1_024,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true,
            readIntent: .seekStart,
            rangeRequestSizeBytes: 1_024 * 1_024,
            rangePrefetchLowWatermarkBytes: 512 * 1_024
        )
        let availability = try await readSession.read(maxLength: 512)

        guard case .available(let chunk) = availability else {
            return XCTFail("Expected bridge data for far seek")
        }

        XCTAssertEqual(chunk, data.subdata(in: 1_024 * 1_024..<(1_024 * 1_024 + 512)))
        for _ in 0..<10 {
            _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }
        let rangeHeaders = loader.recordedRangeHeaders()
        XCTAssertEqual(rangeHeaders, ["bytes=1048576-2097151"])
    }

    func testHTTPReadSessionFarSeekWithoutParallelRangeRequestsWaitsForProgressiveBytes() async throws {
        let data = makeHTTPTestData(byteCount: 3 * 1_024 * 1_024)
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2_048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "no-parallel-bridge.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_048)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 1_024 * 1_024,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: false,
            readIntent: .seekStart
        )

        Task {
            try? await Task.sleep(nanoseconds: 50_000_000)
            loader.appendProgressiveBytes(upTo: 1_024 * 1_024 + 8_192)
        }

        let availability = try await readSession.read(maxLength: 512)
        guard case .available(let chunk) = availability else {
            return XCTFail("Expected progressive data when parallel range requests are disabled")
        }

        XCTAssertEqual(chunk, data.subdata(in: 1_024 * 1_024..<(1_024 * 1_024 + 512)))
        XCTAssertTrue(loader.recordedRangeHeaders().isEmpty)
    }

    func testHTTPReadSessionPrefetchesNextBridgeWindowAtLowWatermark() async throws {
        let data = makeHTTPTestData(byteCount: 4 * 1_024 * 1_024)
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2_048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "prefetch.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_048)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 1_024 * 1_024,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true,
            readIntent: .seekStart,
            rangeRequestSizeBytes: 1_024 * 1_024,
            rangePrefetchLowWatermarkBytes: 512 * 1_024
        )

        _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        loader.setRangeRequestsBlocked(true)

        for _ in 0..<16 {
            _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }

        try await waitUntil("second bridge request starts") {
            loader.recordedRangeHeaders().count == 2 && loader.inFlightRangeRequestCount() == 1
        }

        XCTAssertEqual(
            loader.recordedRangeHeaders(),
            ["bytes=1048576-2097151", "bytes=2097152-3145727"]
        )
        XCTAssertEqual(loader.inFlightRangeRequestCount(), 1)

        for _ in 0..<4 {
            _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }
        XCTAssertEqual(loader.recordedRangeHeaders().count, 2)

        loader.setRangeRequestsBlocked(false)
    }

    func testHTTPReadSessionStopsOpeningNewBridgeWindowsAtBoundaryAfterProgressiveCatchUp() async throws {
        let data = makeHTTPTestData(byteCount: 4 * 1_024 * 1_024)
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2_048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "catch-up.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_048)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 1_024 * 1_024,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true,
            readIntent: .seekStart,
            rangeRequestSizeBytes: 1_024 * 1_024,
            rangePrefetchLowWatermarkBytes: 512 * 1_024
        )

        _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        loader.appendProgressiveBytes(upTo: 2_300_000)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_300_000)

        let bytesRemainingInWindow = 1_024 * 1_024 - SourceReadSizing.decoderReadSize
        let readsToBoundary = bytesRemainingInWindow / SourceReadSizing.decoderReadSize
        for _ in 0..<readsToBoundary {
            _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }

        _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        XCTAssertEqual(
            loader.recordedRangeHeaders(),
            ["bytes=1048576-2097151", "bytes=2097152-3145727"]
        )

        loader.appendProgressiveBytes(upTo: 2_300_000)
        for _ in 0..<4 {
            _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }
        XCTAssertEqual(loader.recordedRangeHeaders().count, 2)
    }

    func testHTTPReadSessionSwitchesToProgressiveAtBoundaryWithoutConsumingSecondBridgeWindow() async throws {
        let data = makeHTTPTestData(byteCount: 4 * 1_024 * 1_024)
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2_048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "boundary-handoff.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_048)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 1_024 * 1_024,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true,
            readIntent: .seekStart,
            rangeRequestSizeBytes: 1_024 * 1_024,
            rangePrefetchLowWatermarkBytes: 512 * 1_024
        )

        _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        loader.appendProgressiveBytes(upTo: 2_300_000)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_300_000)
        loader.setRangeRequestsBlocked(true)

        for _ in 0..<16 {
            _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }

        try await waitUntil("blocked prefetch starts") {
            loader.recordedRangeHeaders().count == 2 && loader.inFlightRangeRequestCount() == 1
        }

        for _ in 0..<15 {
            _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }

        let boundaryChunk = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        guard case .available(let dataChunk) = boundaryChunk else {
            return XCTFail("Expected progressive bytes at window boundary")
        }
        XCTAssertFalse(dataChunk.isEmpty)

        try await waitUntil("prefetch cancels after progressive handoff") {
            loader.cancelledRangeHeaders().count == 1 && loader.inFlightRangeRequestCount() == 0
        }

        for _ in 0..<4 {
            _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }

        XCTAssertEqual(
            loader.recordedRangeHeaders(),
            ["bytes=1048576-2097151", "bytes=2097152-3145727"]
        )
    }

    func testHTTPReadSessionDoesNotSwitchToProgressiveAfterResetUntilBoundaryCatchUpRebuilds() async throws {
        let data = makeHTTPTestData(byteCount: 4 * 1_024 * 1_024)
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2_048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "reset.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_048)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 1_024 * 1_024,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true,
            readIntent: .seekStart,
            rangeRequestSizeBytes: 1_024 * 1_024,
            rangePrefetchLowWatermarkBytes: 512 * 1_024
        )

        _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        loader.appendProgressiveBytes(upTo: 2_097_153)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_097_153)
        loader.restartProgressiveFromZero(deliveringByteCount: 4_096)

        let bytesRemainingInWindow = 1_024 * 1_024 - SourceReadSizing.decoderReadSize
        let readsToBoundary = bytesRemainingInWindow / SourceReadSizing.decoderReadSize
        for _ in 0..<readsToBoundary {
            _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }

        _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        XCTAssertEqual(
            loader.recordedRangeHeaders(),
            ["bytes=1048576-2097151", "bytes=2097152-3145727"]
        )
    }

    func testHTTPReadSessionCancelsInFlightBridgePrefetchOnTeardown() async throws {
        let data = makeHTTPTestData(byteCount: 4 * 1_024 * 1_024)
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2_048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "cancel.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_048)

        var readSession: SourceReadSession? = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 1_024 * 1_024,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true,
            readIntent: .seekStart,
            rangeRequestSizeBytes: 1_024 * 1_024,
            rangePrefetchLowWatermarkBytes: 512 * 1_024
        )

        _ = try await readSession?.read(maxLength: SourceReadSizing.decoderReadSize)
        loader.setRangeRequestsBlocked(true)

        for _ in 0..<16 {
            _ = try await readSession?.read(maxLength: SourceReadSizing.decoderReadSize)
        }

        try await waitUntil("prefetch starts") {
            loader.recordedRangeHeaders().count == 2 && loader.inFlightRangeRequestCount() == 1
        }

        readSession = nil

        try await waitUntil("prefetch cancels") {
            loader.cancelledRangeHeaders().count == 1 && loader.inFlightRangeRequestCount() == 0
        }
    }

    func testHTTPReadSessionCancelsInFlightActiveBridgeFetchOnReadCancellation() async throws {
        let data = makeHTTPTestData(byteCount: 4 * 1_024 * 1_024)
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2_048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "cancel-active.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_048)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 1_024 * 1_024,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true,
            readIntent: .seekStart,
            rangeRequestSizeBytes: 1_024 * 1_024,
            rangePrefetchLowWatermarkBytes: 512 * 1_024
        )

        loader.setRangeRequestsBlocked(true)

        let pendingRead = Task {
            try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }

        try await waitUntil("active bridge fetch starts") {
            loader.recordedRangeHeaders().count == 1 && loader.inFlightRangeRequestCount() == 1
        }

        pendingRead.cancel()

        do {
            _ = try await pendingRead.value
            XCTFail("Expected active bridge fetch to be cancelled")
        } catch {
            XCTAssertTrue(error is CancellationError)
        }

        try await waitUntil("active bridge fetch cancels") {
            loader.cancelledRangeHeaders().count == 1 && loader.inFlightRangeRequestCount() == 0
        }
    }

    func testHTTPReadSessionRejectsProgressiveUpgradeWhenFingerprintChanges() async throws {
        let data = makeHTTPTestData(byteCount: 4 * 1_024 * 1_024)
        let loader = StubHTTPDataLoader(
            data: data,
            initialProgressiveChunkSize: 2_048,
            progressiveFingerprint: CacheFingerprint(contentLength: Int64(data.count), etag: "progressive"),
            rangeFingerprint: CacheFingerprint(contentLength: Int64(data.count), etag: "bridge")
        )
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "fingerprint-mismatch.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_048)

        let readSession = try await sourceManager.makeReadSession(
            for: source,
            startingOffset: 1_024 * 1_024,
            contentLength: Int64(data.count),
            allowsParallelRangeRequests: true,
            readIntent: .seekStart,
            rangeRequestSizeBytes: 1_024 * 1_024,
            rangePrefetchLowWatermarkBytes: 1
        )

        _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        loader.appendProgressiveBytes(upTo: 2_097_153)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2_097_153)

        let bytesRemainingInWindow = 1_024 * 1_024 - SourceReadSizing.decoderReadSize
        let readsToBoundary = bytesRemainingInWindow / SourceReadSizing.decoderReadSize
        for _ in 0..<readsToBoundary {
            _ = try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)
        }

        await XCTAssertThrowsErrorAsync(try await readSession.read(maxLength: SourceReadSizing.decoderReadSize)) { error in
            guard case GaplessMP3PlayerError.sourceIdentityMismatch = error else {
                return XCTFail("Expected source identity mismatch, got \(error)")
            }
        }
    }

    func testDownloadStatusBecomesCachedAfterProgressiveDownloadCompletes() async throws {
        let data = try httpFixtureData(named: "gd77-s2t07-first-5s.mp3")
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2048)
        let sourceManager = makeHTTPSourceManager(loader: loader)
        let source = httpFixtureSource(id: "current", path: "gd77-s2t07-first-5s.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2048)

        loader.finishProgressiveDownload()
        let status = try await waitForDownloadState(sourceManager: sourceManager, source: source) { status in
            status.state == .cached
        }

        XCTAssertEqual(status.downloadedBytes, Int64(data.count))
        XCTAssertEqual(status.expectedBytes, Int64(data.count))
        XCTAssertEqual(status.state, .cached)
        XCTAssertNotNil(status.resolvedFileURL)
    }

    func testDownloadStatusBecomesCompletedWhenCachingIsDisabled() async throws {
        let data = try httpFixtureData(named: "gd77-s2t07-first-5s.mp3")
        let loader = StubHTTPDataLoader(data: data, initialProgressiveChunkSize: 2048)
        let sourceManager = makeHTTPSourceManager(loader: loader, cacheMode: .disabled)
        let source = httpFixtureSource(id: "current", path: "gd77-s2t07-first-5s.mp3", byteCount: data.count)

        try await sourceManager.preload(source)
        try await waitForDownloadedBytes(sourceManager: sourceManager, source: source, minimum: 2048)

        loader.finishProgressiveDownload()
        let status = try await waitForDownloadState(sourceManager: sourceManager, source: source) { status in
            status.state == .completed
        }

        XCTAssertEqual(status.downloadedBytes, Int64(data.count))
        XCTAssertEqual(status.expectedBytes, Int64(data.count))
        XCTAssertEqual(status.state, .completed)
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

    private func makeHTTPPlayer(
        outputGraph: TestOutputGraph,
        cacheMode: GaplessCacheMode = .enabled
    ) -> GaplessMP3Player {
        let cacheDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("GaplessMP3PlayerHTTPPlayerTests-\(UUID().uuidString)", isDirectory: true)
        let sourceManager = MP3SourceManager(cacheDirectory: cacheDirectory, cacheMode: cacheMode)
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

    private func makeHTTPSourceManager(
        loader: some HTTPDataLoading,
        cacheMode: GaplessCacheMode = .enabled
    ) -> MP3SourceManager {
        makeHTTPSourceManagerWithCacheDirectory(loader: loader, cacheMode: cacheMode).manager
    }

    private func makeHTTPSourceManagerWithCacheDirectory(
        loader: some HTTPDataLoading,
        cacheMode: GaplessCacheMode = .enabled
    ) -> (manager: MP3SourceManager, cacheDirectory: URL) {
        let cacheDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("GaplessMP3PlayerHTTPTests-\(UUID().uuidString)", isDirectory: true)
        return (
            MP3SourceManager(cacheDirectory: cacheDirectory, cacheMode: cacheMode, loader: loader),
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

    private func phishSimple19961118Source() -> GaplessPlaybackSource {
        let localFixtureURL = phishSimple19961118LocalFixtureURL()
        let sourceURL = FileManager.default.fileExists(atPath: localFixtureURL.path)
            ? localFixtureURL
            : phishSimple19961118RemoteURL()
        return GaplessPlaybackSource(
            id: "phish-simple-1996-11-18",
            url: sourceURL,
            cacheKey: "phish-simple-1996-11-18-cz9b6pep6c45kajmuop522kj169k",
            expectedContentLength: 24_481_199
        )
    }

    private func phishSimple19961118RemoteURL() -> URL {
        URL(string: "https://audio.relisten.net/phish.in/blob/cz9b6pep6c45kajmuop522kj169k.mp3")!
    }

    private func phishSimple19961118LocalFixtureURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("E2EFixtures", isDirectory: true)
            .appendingPathComponent("phish-simple-1996-11-18-cz9b6pep6c45kajmuop522kj169k.mp3")
    }

    private func expectedCBRSeekByteOffset(metadata: MP3TrackMetadata, startTime: TimeInterval) -> Int64? {
        guard let bitrate = metadata.estimatedBitrate else {
            return nil
        }
        let logicalStartFrames = Int64(startTime * Double(metadata.sampleRate))
        let rawStartFrames = logicalStartFrames + Int64(metadata.encoderDelayFrames)
        let targetFrameIndex = max(rawStartFrames / Int64(max(metadata.samplesPerFrame, 1)), 0)
        let anchorFrameIndex = max(targetFrameIndex - 1, 0)
        let anchorRawFrames = anchorFrameIndex * Int64(metadata.samplesPerFrame)
        let anchorTimeUs = (anchorRawFrames * 1_000_000) / Int64(metadata.sampleRate)
        return metadata.dataStartOffset + (anchorTimeUs * Int64(bitrate)) / 8_000_000
    }

    private func firstRangeRequestStart(in events: [GaplessHTTPLogEvent]) -> Int64? {
        for event in events where event.requestKind == .range && event.kind == .requestStarted {
            guard let header = event.requestHeaders["Range"], header.hasPrefix("bytes=") else {
                continue
            }
            let rawRange = header.dropFirst("bytes=".count)
            guard let start = rawRange.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false).first else {
                continue
            }
            return Int64(start)
        }
        return nil
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

    private func waitForDownloadState(
        sourceManager: MP3SourceManager,
        source: GaplessPlaybackSource,
        matcher: @escaping (SourceDownloadStatus) -> Bool
    ) async throws -> SourceDownloadStatus {
        for _ in 0..<100 {
            if let status = await sourceManager.downloadStatus(for: source), matcher(status) {
                return status
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Timed out waiting for terminal download state")
        throw CancellationError()
    }

    private func waitUntil(
        _ description: String,
        timeoutIterations: Int = 100,
        condition: @escaping () -> Bool
    ) async throws {
        for _ in 0..<timeoutIterations {
            if condition() {
                return
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Timed out waiting for \(description)")
    }

    private func requireLiveAudioE2E() throws {
        guard ProcessInfo.processInfo.environment["RELISTEN_AUDIO_E2E"] == "1" else {
            let remoteURL = phishSimple19961118RemoteURL().absoluteString
            let localPath = phishSimple19961118LocalFixtureURL().path
            throw XCTSkip(
                """
                Set RELISTEN_AUDIO_E2E=1 to run live audio regression tests. \
                This test uses Phish - Simple, 1996-11-18, \(remoteURL) \
                (24,481,199 bytes). By default it streams that URL. For an \
                offline local fixture, download the MP3 and place it at \(localPath). \
                The E2EFixtures directory is gitignored.
                """
            )
        }
    }

    private func XCTAssertThrowsErrorAsync(
        _ expression: @autoclosure () async throws -> some Sendable,
        _ errorHandler: (Error) -> Void
    ) async {
        do {
            _ = try await expression()
            XCTFail("Expected error to be thrown")
        } catch {
            errorHandler(error)
        }
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

    private func makeHTTPTestData(byteCount: Int) -> Data {
        Data((0..<byteCount).map { UInt8($0 % 251) })
    }

    private func makeCBRMP3Data(
        frameCount: Int,
        bitrateKbps: Int,
        xingDataSizeOnly: Bool = false
    ) -> Data {
        makeMP3Data(
            frameBitratesKbps: Array(repeating: bitrateKbps, count: frameCount),
            xingDataSizeOnly: xingDataSizeOnly
        )
    }

    private func makeMP3Data(
        frameBitratesKbps: [Int],
        xingDataSizeOnly: Bool = false
    ) -> Data {
        var data = Data()
        for (frameIndex, bitrateKbps) in frameBitratesKbps.enumerated() {
            let padded = frameIndex % 16 != 0
            let frameSize = mpeg1Layer3FrameSize(bitrateKbps: bitrateKbps, padded: padded)
            var frame = Data(repeating: 0, count: frameSize)
            writeUInt32BE(mpeg1Layer3Header(bitrateKbps: bitrateKbps, padded: padded), to: &frame, at: 0)
            data.append(frame)
        }

        if xingDataSizeOnly {
            writeASCII("Xing", to: &data, at: 36)
            writeUInt32BE(0x2, to: &data, at: 40)
            writeUInt32BE(UInt32(data.count), to: &data, at: 44)
        }

        return data
    }

    private func mpeg1Layer3FrameSize(bitrateKbps: Int, padded: Bool) -> Int {
        ((144 * bitrateKbps * 1_000) / 44_100) + (padded ? 1 : 0)
    }

    private func mpeg1Layer3Header(bitrateKbps: Int, padded: Bool) -> UInt32 {
        let bitrates = [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        guard let bitrateIndex = bitrates.firstIndex(of: bitrateKbps).map({ UInt32($0 + 1) }) else {
            preconditionFailure("Unsupported test bitrate")
        }
        let versionBits: UInt32 = 0b11
        let layerBits: UInt32 = 0b01
        let protectionAbsent: UInt32 = 1
        let sampleRateIndex: UInt32 = 0
        let paddingBit: UInt32 = padded ? 1 : 0
        let channelModeBits: UInt32 = 0b00
        return 0xFFE0_0000 |
            (versionBits << 19) |
            (layerBits << 17) |
            (protectionAbsent << 16) |
            (bitrateIndex << 12) |
            (sampleRateIndex << 10) |
            (paddingBit << 9) |
            (channelModeBits << 6)
    }

    private func writeASCII(_ value: String, to data: inout Data, at offset: Int) {
        for (index, byte) in value.utf8.enumerated() {
            data[offset + index] = byte
        }
    }

    private func writeUInt32BE(_ value: UInt32, to data: inout Data, at offset: Int) {
        data[offset] = UInt8((value >> 24) & 0xFF)
        data[offset + 1] = UInt8((value >> 16) & 0xFF)
        data[offset + 2] = UInt8((value >> 8) & 0xFF)
        data[offset + 3] = UInt8(value & 0xFF)
    }

    private func replaceFirstASCII(_ needle: String, with replacement: String, in data: inout Data) throws {
        let needleBytes = Array(needle.utf8)
        let replacementBytes = Array(replacement.utf8)
        XCTAssertEqual(needleBytes.count, replacementBytes.count)
        guard let range = data.range(of: Data(needleBytes)) else {
            throw TestFailure.missingBytes(needle)
        }
        data.replaceSubrange(range, with: replacementBytes)
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
    private let progressiveFingerprint: CacheFingerprint
    private let rangeFingerprint: CacheFingerprint
    private let stateQueue = DispatchQueue(label: "StubHTTPDataLoader.state")
    private var progressiveContinuation: AsyncThrowingStream<HTTPDownloadEvent, Error>.Continuation?
    private var progressiveDidFinish = false
    private var rangeHeaders: [String] = []
    private var completedRangeHeaderValues: [String] = []
    private var cancelledRangeHeaderValues: [String] = []
    private var blockRangeRequests = false
    private var activeRangeRequestCount = 0
    private var progressiveCursor = 0
    private var progressiveDownloadCallCount = 0

    init(
        data: Data,
        initialProgressiveChunkSize: Int,
        progressiveFingerprint: CacheFingerprint? = nil,
        rangeFingerprint: CacheFingerprint? = nil
    ) {
        self.data = data
        self.initialProgressiveChunkSize = min(max(initialProgressiveChunkSize, 0), data.count)
        let defaultFingerprint = CacheFingerprint(contentLength: Int64(data.count))
        self.progressiveFingerprint = progressiveFingerprint ?? defaultFingerprint
        self.rangeFingerprint = rangeFingerprint ?? self.progressiveFingerprint
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
                self.progressiveDownloadCallCount += 1
                self.progressiveContinuation = continuation
                self.progressiveCursor = initialChunk.count
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
            activeRangeRequestCount += 1
        }
        do {
            while stateQueue.sync(execute: { blockRangeRequests }) {
                try Task.checkCancellation()
                try await Task.sleep(nanoseconds: 10_000_000)
            }

            let (start, end) = try parseRangeHeader(header, totalBytes: data.count)
            let result = RangeReadResult(
                data: data.subdata(in: start..<(end + 1)),
                fingerprint: rangeFingerprint
            )
            stateQueue.sync {
                completedRangeHeaderValues.append(header)
                activeRangeRequestCount -= 1
            }
            return result
        } catch is CancellationError {
            stateQueue.sync {
                cancelledRangeHeaderValues.append(header)
                activeRangeRequestCount -= 1
            }
            throw CancellationError()
        } catch {
            stateQueue.sync {
                activeRangeRequestCount -= 1
            }
            throw error
        }
    }

    func appendProgressiveBytes(upTo byteCount: Int) {
        let progress: (AsyncThrowingStream<HTTPDownloadEvent, Error>.Continuation?, Data) = stateQueue.sync {
            let target = min(max(byteCount, progressiveCursor), data.count)
            let nextData = target > progressiveCursor ? Data(data[progressiveCursor..<target]) : Data()
            progressiveCursor = target
            return (progressiveContinuation, nextData)
        }
        guard let continuation = progress.0, !progress.1.isEmpty else {
            return
        }
        continuation.yield(.bytes(progress.1))
    }

    func restartProgressiveFromZero(deliveringByteCount: Int) {
        let progress: (AsyncThrowingStream<HTTPDownloadEvent, Error>.Continuation?, HTTPURLResponse?, Data) = stateQueue.sync {
            guard let continuation = progressiveContinuation else {
                return (nil, nil, Data())
            }
            let target = min(max(deliveringByteCount, 0), data.count)
            progressiveCursor = target
            let response = makeResponse(
                for: URLRequest(url: URL(string: "https://example.test/restart.mp3")!),
                range: nil,
                contentLength: Int64(data.count)
            )
            let initialBytes = target > 0 ? Data(data[..<target]) : Data()
            return (continuation, response, initialBytes)
        }
        guard let continuation = progress.0, let response = progress.1 else {
            return
        }
        continuation.yield(.response(response, restartFromZero: true))
        if !progress.2.isEmpty {
            continuation.yield(.bytes(progress.2))
        }
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
        let remainingBytes: Data = stateQueue.sync {
            guard progressiveCursor < data.count else { return Data() }
            let bytes = Data(data[progressiveCursor...])
            progressiveCursor = data.count
            return bytes
        }
        if !remainingBytes.isEmpty {
            continuation.yield(.bytes(remainingBytes))
        }
        continuation.yield(.completed)
        continuation.finish()
    }

    func setRangeRequestsBlocked(_ blocked: Bool) {
        stateQueue.sync {
            blockRangeRequests = blocked
        }
    }

    func recordedRangeHeaders() -> [String] {
        stateQueue.sync { rangeHeaders }
    }

    func progressiveDownloadInvocationCount() -> Int {
        stateQueue.sync { progressiveDownloadCallCount }
    }

    func completedRangeHeaders() -> [String] {
        stateQueue.sync { completedRangeHeaderValues }
    }

    func cancelledRangeHeaders() -> [String] {
        stateQueue.sync { cancelledRangeHeaderValues }
    }

    func inFlightRangeRequestCount() -> Int {
        stateQueue.sync { activeRangeRequestCount }
    }

    private func makeResponse(for request: URLRequest, range: ClosedRange<Int>?, contentLength: Int64) -> HTTPURLResponse {
        var headers = ["Content-Type": "audio/mpeg", "Content-Length": "\(contentLength)"]
        if let etag = progressiveFingerprint.etag {
            headers["ETag"] = etag
        }
        if let lastModified = progressiveFingerprint.lastModified {
            headers["Last-Modified"] = lastModified
        }
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
    case missingBytes(String)
}

private extension Int64 {
    var secondsFromMicroseconds: TimeInterval {
        TimeInterval(self) / 1_000_000
    }
}

private final class HTTPLogRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var recordedEvents: [GaplessHTTPLogEvent] = []

    func record(_ event: GaplessHTTPLogEvent) {
        lock.lock()
        defer { lock.unlock() }
        recordedEvents.append(event)
    }

    func events() -> [GaplessHTTPLogEvent] {
        lock.lock()
        defer { lock.unlock() }
        return recordedEvents
    }
}

private final class TestOutputGraph: PCMOutputControlling, @unchecked Sendable {
    private let lock = NSLock()
    private let advanceTimeOnSchedule: Bool
    private let requestPlayError: Error?
    private let resetError: Error?
    private var timelineOffset: TimeInterval
    private var playing: Bool
    private var outputVolume: Float = 1.0
    private var scheduledChunks: [PCMChunk] = []
    private var playedBackCallbacks: [@Sendable () -> Void] = []

    init(
        currentTime: TimeInterval = 0,
        isPlaying: Bool = false,
        advanceTimeOnSchedule: Bool = false,
        requestPlayError: Error? = nil,
        resetError: Error? = nil
    ) {
        self.advanceTimeOnSchedule = advanceTimeOnSchedule
        self.requestPlayError = requestPlayError
        self.resetError = resetError
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

    func reset(timelineOffset: TimeInterval, startEngine: Bool) throws {
        if let resetError {
            throw resetError
        }
        lock.lock()
        defer { lock.unlock() }
        self.timelineOffset = timelineOffset
        scheduledChunks = []
        playedBackCallbacks = []
    }

    func setCurrentTime(_ time: TimeInterval) {
        lock.lock()
        defer { lock.unlock() }
        timelineOffset = time
    }

    func requestPlay() throws {
        if let requestPlayError {
            throw requestPlayError
        }
        lock.lock()
        defer { lock.unlock() }
        playing = true
    }

    func schedule(_ chunk: PCMChunk, playedBack: (@Sendable () -> Void)?) throws {
        lock.lock()
        defer { lock.unlock() }
        scheduledChunks.append(chunk)
        if let playedBack {
            playedBackCallbacks.append(playedBack)
        }
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

    func fireAllPlayedBackCallbacks() {
        let callbacks: [@Sendable () -> Void]
        lock.lock()
        callbacks = playedBackCallbacks
        playedBackCallbacks.removeAll()
        lock.unlock()

        callbacks.forEach { $0() }
    }

    func fireNextPlayedBackCallback() {
        let callback: (@Sendable () -> Void)?
        lock.lock()
        if playedBackCallbacks.isEmpty {
            callback = nil
        } else {
            callback = playedBackCallbacks.removeFirst()
        }
        lock.unlock()

        callback?()
    }

    func playedBackCallbackCount() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return playedBackCallbacks.count
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
