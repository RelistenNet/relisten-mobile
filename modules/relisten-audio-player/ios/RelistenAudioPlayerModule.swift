import ExpoModulesCore
import Foundation

private let moduleLifecycleLog = RelistenPlaybackLogger(layer: .backend, category: .lifecycle)

struct RelistenStreamable: Record {
    @Field
    var url: URL?

    @Field
    var identifier: String?

    @Field
    var cacheKey: String?

    @Field
    var title: String?

    @Field
    var albumTitle: String?

    @Field
    var albumArt: String?

    @Field
    var artist: String?

    @Field
    var downloadDestination: URL?
}

var DEBUG_state = ""

public class RelistenAudioPlayerModule: Module {
    var player: PlaybackBackend?
    private let moduleInstanceID = UUID().uuidString

    // Each module class must implement the definition function. The definition consists of components
    // that describes the module's functionality and behavior.
    // See https://docs.expo.dev/modules/module-api for more details about available components.
    public func definition() -> ModuleDefinition {
        // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
        // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
        // The module will be accessible from `requireNativeModule('RelistenAudioPlayer')` in JavaScript.
        Name("RelistenAudioPlayer")

        OnCreate {
            moduleLifecycleLog.info(
                "created",
                "module instance",
                playbackLogField("id", moduleInstanceID)
            )
            player = makePlaybackBackend()
            player?.delegate = self
        }
        
        OnDestroy {
            moduleLifecycleLog.info(
                "destroyed",
                "module instance",
                playbackLogField("id", moduleInstanceID)
            )
            player?.teardown()
            player = nil
        }

        Events(
            "onError",
            "onPlaybackStateChanged",
            "onPlaybackProgressChanged",
            "onDownloadProgressChanged",
            "onTrackChanged",
            "onRemoteControl",
            "onTrackStreamingCacheComplete"
        )

        Function("currentDuration") {
            return player?.currentDurationSnapshot
        }

        Function("currentState") {
            return player?.currentStateSnapshot ?? .Stopped
        }

        Function("currentStateStr") {
            return player?.currentStateString ?? String(describing: PlaybackState.Stopped)
        }

        Function("elapsed") {
            return player?.elapsedSnapshot
        }

        Function("volume") {
            return player?.volume ?? 0.0
        }

        Function("setVolume") { (newVolume: Float) in
            return player?.volume = newVolume
        }

        Function("prepareAudioSession") {
            player?.enqueuePrepareAudioSession()
        }

        AsyncFunction("playbackProgress") { (promise: Promise) in
            guard let player = self.player else {
                promise.resolve(["playbackProgress": nil] as [String: Any?])
                return
            }

            player.requestPlaybackProgress { snapshot in
                promise.resolve([
                    "playbackProgress": [
                        "elapsed": snapshot.elapsed,
                        "duration": snapshot.duration
                    ] as [String: TimeInterval?],
                    "activeTrackDownloadProgress": [
                        "forActiveTrack": true,
                        "downloadedBytes": snapshot.activeTrackDownloadedBytes as Any,
                        "totalBytes": snapshot.activeTrackTotalBytes as Any
                    ] as [String: Any]
                ] as [String: Any])
            }
        }

        AsyncFunction("play") { (streamable: RelistenStreamable, startingAtMs: Int64?, promise: Promise) in
            guard let url = streamable.url,
                  let identifier = streamable.identifier,
                  let cacheKey = streamable.cacheKey,
                  let title = streamable.title,
                  let albumArt = streamable.albumArt,
                  let albumTitle = streamable.albumTitle,
                  let artist = streamable.artist else {
                promise.resolve()
                return
            }

            player?.enqueuePlay(
                RelistenGaplessStreamable(
                    url: url,
                    identifier: identifier,
                    cacheKey: cacheKey,
                    title: title,
                    artist: artist,
                    albumTitle: albumTitle,
                    albumArt: albumArt,
                    downloadDestination: streamable.downloadDestination
                ),
                startingAtMs: startingAtMs
            ) {
                promise.resolve()
            }
        }

        Function("setNextStream") { (streamable: RelistenStreamable?) in
            if streamable == nil {
                player?.enqueueSetNextStream(nil)
                return
            }

            guard let streamable = streamable,
                  let url = streamable.url,
                  let identifier = streamable.identifier,
                  let cacheKey = streamable.cacheKey,
                  let title = streamable.title,
                  let albumTitle = streamable.albumTitle,
                  let albumArt = streamable.albumArt,
                  let artist = streamable.artist else {
                return
            }
            
            player?.enqueueSetNextStream(
                RelistenGaplessStreamable(
                    url: url,
                    identifier: identifier,
                    cacheKey: cacheKey,
                    title: title,
                    artist: artist,
                    albumTitle: albumTitle,
                    albumArt: albumArt,
                    downloadDestination: streamable.downloadDestination
                )
            )
        }

        Function("setRepeatMode") { (repeatMode: Int) in
            player?.enqueueSetRepeatMode(repeatMode)
        }

        Function("setShuffleMode") { (shuffleMode: Int) in
            player?.enqueueSetShuffleMode(shuffleMode)
        }

        AsyncFunction("resume") { (promise: Promise) in
            player?.enqueueResume {
                promise.resolve()
            }
        }

        AsyncFunction("pause") { (promise: Promise) in
            player?.enqueuePause {
                promise.resolve()
            }
        }

        AsyncFunction("stop") { (promise: Promise) in
            player?.enqueueStop {
                promise.resolve()
            }
        }

        AsyncFunction("next") { (promise: Promise) in
            player?.enqueueNext {
                promise.resolve()
            }
        }

        AsyncFunction("seekTo") { (pct: Double, promise: Promise) in
            player?.enqueueSeekTo(percent: pct) {
                promise.resolve()
            }
        }
        
        AsyncFunction("seekToTime") { (timeMs: Int64, promise: Promise) in
            player?.enqueueSeekToTime(timeMs) {
                promise.resolve()
            }
        }
    }
}

extension RelistenAudioPlayerModule: PlaybackBackendDelegate {
    public func sendAndLogEvent(_ eventName: String, _ body: [String: Any?] = [:]) {
        NSLog("[relisten-audio-player] sendEvent: eventName=\(eventName) body=\(body)")
        self.sendEvent(eventName, body)
    }
    
    public func streamingCacheCompleted(forStreamable streamable: RelistenGaplessStreamable, bytesWritten: Int) {
        self.sendAndLogEvent("onTrackStreamingCacheComplete", [
            "identifier": streamable.identifier,
            "totalBytes": bytesWritten
        ])
    }
    
    public func errorStartingStream(error: NSError, forStreamable: RelistenGaplessStreamable) {
        self.sendAndLogEvent("onError", [
            "error": error.code,
            "errorDescription": error.localizedDescription,
            "identifier": forStreamable.identifier
        ])
    }

    public func playbackStateChanged(newPlaybackState playbackState: PlaybackState) {
        self.sendAndLogEvent("onPlaybackStateChanged", [
            "newPlaybackState": String(describing: playbackState)
        ])
    }

    public func playbackProgressChanged(elapsed: TimeInterval?, duration: TimeInterval?) {
        self.sendEvent("onPlaybackProgressChanged", [
            "elapsed": elapsed,
            "duration": duration
        ])
    }

    public func downloadProgressChanged(forActiveTrack: Bool, downloadedBytes: UInt64, totalBytes: UInt64) {
        self.sendEvent("onDownloadProgressChanged", [
            "forActiveTrack": forActiveTrack,
            "downloadedBytes": downloadedBytes,
            "totalBytes": totalBytes
        ])
    }

    public func trackChanged(previousStreamable: RelistenGaplessStreamable?, currentStreamable: RelistenGaplessStreamable?) {
        self.sendAndLogEvent("onTrackChanged", [
            "previousIdentifier": previousStreamable?.identifier,
            "currentIdentifier": currentStreamable?.identifier
        ])
    }

    public func remoteControl(method: String) {
        self.sendAndLogEvent("onRemoteControl", [
            "method": method
        ])
    }

    public func audioSessionWasSetup() {

    }
}
