import AVFoundation
import Dispatch
import Foundation

private let outputGraphLifecycleLog = RelistenPlaybackLogger(layer: .player, category: .lifecycle)

/// Owns the single continuous output timeline for playback.
///
/// The design docs explicitly call for "one persistent output graph and swap PCM
/// producers, not players". Keeping one `AVAudioEngine` + `AVAudioPlayerNode` avoids
/// a discontinuity at the boundary and gives the coordinator one place to measure
/// scheduled-vs-rendered time.
final class PCMOutputGraph: PCMOutputControlling, @unchecked Sendable {
    private let ownerQueue: DispatchQueue
    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private let format: AVAudioFormat
    private var pendingBufferCount = 0
    private var decodeFinished = false
    private var wantsPlayback = false
    private var lastKnownTime: TimeInterval = 0
    private var timelineOffset: TimeInterval = 0

    init(sampleRate: Double, channelCount: Int, ownerQueue: DispatchQueue) throws {
        self.ownerQueue = ownerQueue
        dispatchPrecondition(condition: .onQueue(ownerQueue))

        guard let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: AVAudioChannelCount(channelCount),
            interleaved: false
        ) else {
            throw GaplessMP3PlayerError.unsupportedFormat("Could not create playback format")
        }

        self.format = format
        engine.attach(playerNode)
        engine.connect(playerNode, to: engine.mainMixerNode, format: format)
        try engine.start()
    }

    var isPlaying: Bool {
        dispatchPrecondition(condition: .onQueue(ownerQueue))
        return playerNode.isPlaying
    }

    var isEngineRunning: Bool {
        dispatchPrecondition(condition: .onQueue(ownerQueue))
        return engine.isRunning
    }

    var volume: Float {
        get {
            dispatchPrecondition(condition: .onQueue(ownerQueue))
            return engine.mainMixerNode.outputVolume
        }
        set {
            dispatchPrecondition(condition: .onQueue(ownerQueue))
            engine.mainMixerNode.outputVolume = newValue
        }
    }

    var isFinished: Bool {
        dispatchPrecondition(condition: .onQueue(ownerQueue))
        return decodeFinished && pendingBufferCount == 0 && !playerNode.isPlaying
    }

    /// Resets graph state for a new logical playback session while preserving the
    /// underlying engine object. Paused seeks can keep the engine paused, while
    /// play/restart paths can explicitly warm it before scheduling resumes.
    func reset(timelineOffset: TimeInterval, startEngine: Bool) throws {
        dispatchPrecondition(condition: .onQueue(ownerQueue))
        updateLastKnownTime()
        self.timelineOffset = timelineOffset
        self.lastKnownTime = timelineOffset
        self.pendingBufferCount = 0
        self.decodeFinished = false
        self.wantsPlayback = false
        playerNode.stop()
        playerNode.reset()
        if startEngine {
            try startEngineIfNeeded(context: "reset")
        }
    }

    /// Schedules already-trimmed PCM onto the single output node.
    ///
    /// The graph is intentionally agnostic about tracks. By the time audio reaches this
    /// layer it is just one continuous PCM timeline.
    func schedule(_ chunk: PCMChunk, playedBack: (@Sendable () -> Void)?) throws {
        dispatchPrecondition(condition: .onQueue(ownerQueue))
        let buffer = try chunk.toAVAudioPCMBuffer(interleaved: false)
        pendingBufferCount += 1
        playerNode.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self, ownerQueue] _ in
            ownerQueue.async { [weak self] in
                self?.handleScheduledBufferDrain(playedBack: playedBack)
            }
        }
        if wantsPlayback && !playerNode.isPlaying {
            try startEngineIfNeeded(context: "schedule")
            playerNode.play()
        }
    }

    /// Defers `play()` until at least one buffer is queued so "ready to play" can mean
    /// actual buffered audio, not just an empty node in the playing state.
    func requestPlay() throws {
        dispatchPrecondition(condition: .onQueue(ownerQueue))
        wantsPlayback = true
        if pendingBufferCount > 0 && !playerNode.isPlaying {
            try startEngineIfNeeded(context: "requestPlay")
            playerNode.play()
        }
    }

    func pause() {
        dispatchPrecondition(condition: .onQueue(ownerQueue))
        updateLastKnownTime()
        wantsPlayback = false
        playerNode.pause()
        if engine.isRunning {
            engine.pause()
            outputGraphLifecycleLog.info(
                "paused",
                "output engine",
                playbackLogIntegerField("pending", pendingBufferCount),
                playbackLogDurationField("time", lastKnownTime)
            )
        }
    }

    /// Signals that decode has no more chunks to schedule. `isFinished` still waits for
    /// the final queued buffers to drain from the player node.
    func markDecodeFinished() {
        dispatchPrecondition(condition: .onQueue(ownerQueue))
        decodeFinished = true
    }

    /// Returns a monotonic timeline time even across pauses and graph resets.
    ///
    /// `AVAudioPlayerNode` time queries can temporarily return nil around resets, so we
    /// cache the last known timeline value instead of letting callers observe time going
    /// backwards.
    func currentTime() -> TimeInterval {
        dispatchPrecondition(condition: .onQueue(ownerQueue))
        if let renderTime = playerNode.lastRenderTime,
           let playerTime = playerNode.playerTime(forNodeTime: renderTime) {
            let elapsed = Double(playerTime.sampleTime) / playerTime.sampleRate
            lastKnownTime = max(timelineOffset + elapsed, lastKnownTime)
        }
        return lastKnownTime
    }

    private func updateLastKnownTime() {
        _ = currentTime()
    }

    private func startEngineIfNeeded(context: String) throws {
        guard !engine.isRunning else { return }
        do {
            try engine.start()
        } catch {
            throw GaplessMP3PlayerError.audioPipeline("Could not start output engine during \(context): \(error)")
        }
        outputGraphLifecycleLog.info(
            "started",
            "output engine",
            playbackLogField("ctx", context),
            playbackLogIntegerField("pending", pendingBufferCount),
            playbackLogBoolField("wants", wantsPlayback)
        )
    }

    private func handleScheduledBufferDrain(playedBack: (@Sendable () -> Void)?) {
        dispatchPrecondition(condition: .onQueue(ownerQueue))
        pendingBufferCount = max(pendingBufferCount - 1, 0)
        playedBack?()
    }
}
