import Foundation

protocol PlaybackBackendDelegate: AnyObject {
    func errorStartingStream(error: NSError, forStreamable: RelistenGaplessStreamable)
    func playbackStateChanged(newPlaybackState: PlaybackState)
    func playbackProgressChanged(elapsed: TimeInterval?, duration: TimeInterval?)
    func downloadProgressChanged(forActiveTrack: Bool, downloadedBytes: UInt64, totalBytes: UInt64)
    func trackChanged(previousStreamable: RelistenGaplessStreamable?, currentStreamable: RelistenGaplessStreamable?)
    func remoteControl(method: String)
    func streamingCacheCompleted(forStreamable streamable: RelistenGaplessStreamable, bytesWritten: Int)
    func audioSessionWasSetup()
}

struct PlaybackBackendProgressSnapshot {
    let elapsed: TimeInterval?
    let duration: TimeInterval?
    let activeTrackDownloadedBytes: UInt64?
    let activeTrackTotalBytes: UInt64?
}

protocol PlaybackBackend: AnyObject {
    var delegate: PlaybackBackendDelegate? { get set }
    var currentDurationSnapshot: TimeInterval? { get }
    var currentStateSnapshot: PlaybackState { get }
    var currentStateString: String { get }
    var elapsedSnapshot: TimeInterval? { get }
    var volume: Float { get set }

    func enqueuePrepareAudioSession()
    func requestPlaybackProgress(_ completion: @escaping (PlaybackBackendProgressSnapshot) -> Void)
    func enqueuePlay(_ streamable: RelistenGaplessStreamable, startingAtMs: Int64?, completion: @escaping () -> Void)
    func enqueueSetNextStream(_ streamable: RelistenGaplessStreamable?)
    func enqueueSetRepeatMode(_ repeatMode: Int)
    func enqueueSetShuffleMode(_ shuffleMode: Int)
    func enqueueResume(_ completion: @escaping () -> Void)
    func enqueuePause(_ completion: @escaping () -> Void)
    func enqueueStop(_ completion: @escaping () -> Void)
    func enqueueNext(_ completion: @escaping () -> Void)
    func enqueueSeekTo(percent: Double, completion: @escaping () -> Void)
    func enqueueSeekToTime(_ timeMs: Int64, completion: @escaping () -> Void)
    func teardown()
}

extension RelistenGaplessAudioPlayer: PlaybackBackend {
    var currentDurationSnapshot: TimeInterval? {
        bassQueue.sync {
            currentDuration
        }
    }

    var currentStateSnapshot: PlaybackState {
        bassQueue.sync {
            currentState
        }
    }

    var currentStateString: String {
        bassQueue.sync {
            String(describing: currentState)
        }
    }

    var elapsedSnapshot: TimeInterval? {
        bassQueue.sync {
            elapsed
        }
    }

    func enqueuePrepareAudioSession() {
        bassQueue.async {
            self.prepareAudioSession()
        }
    }

    func requestPlaybackProgress(_ completion: @escaping (PlaybackBackendProgressSnapshot) -> Void) {
        bassQueue.async {
            completion(
                PlaybackBackendProgressSnapshot(
                    elapsed: self.elapsed,
                    duration: self.currentDuration,
                    activeTrackDownloadedBytes: self.activeTrackDownloadedBytes,
                    activeTrackTotalBytes: self.activeTrackTotalBytes
                )
            )
        }
    }

    func enqueuePlay(_ streamable: RelistenGaplessStreamable, startingAtMs: Int64?, completion: @escaping () -> Void) {
        bassQueue.async {
            self.play(streamable, startingAtMs: startingAtMs)
            completion()
        }
    }

    func enqueueSetNextStream(_ streamable: RelistenGaplessStreamable?) {
        bassQueue.async {
            self.setNextStream(streamable)
        }
    }

    func enqueueSetRepeatMode(_ repeatMode: Int) {
        bassQueue.async {
            self.setRepeatMode(repeatMode)
        }
    }

    func enqueueSetShuffleMode(_ shuffleMode: Int) {
        bassQueue.async {
            self.setShuffleMode(shuffleMode)
        }
    }

    func enqueueResume(_ completion: @escaping () -> Void) {
        bassQueue.async {
            self.resume()
            completion()
        }
    }

    func enqueuePause(_ completion: @escaping () -> Void) {
        bassQueue.async {
            self.pause()
            completion()
        }
    }

    func enqueueStop(_ completion: @escaping () -> Void) {
        bassQueue.async {
            self.stop()
            completion()
        }
    }

    func enqueueNext(_ completion: @escaping () -> Void) {
        bassQueue.async {
            self.next()
            completion()
        }
    }

    func enqueueSeekTo(percent: Double, completion: @escaping () -> Void) {
        bassQueue.async {
            self.seekTo(percent: percent)
            completion()
        }
    }

    func enqueueSeekToTime(_ timeMs: Int64, completion: @escaping () -> Void) {
        bassQueue.async {
            self.seekToTime(timeMs)
            completion()
        }
    }

    func teardown() {
        bassQueue.sync {
            self.stop()
            self.maybeTearDownBASS()
            self.tearDownAudioSession()
        }

        audioSessionController.teardown()
        playbackPresentationController.teardown()
    }
}
