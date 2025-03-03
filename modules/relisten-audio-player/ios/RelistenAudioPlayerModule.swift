import ExpoModulesCore

// import bass

struct RelistenStreamable: Record {
    @Field
    var url: URL?

    @Field
    var identifier: String?

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
    var player: RelistenGaplessAudioPlayer?

    // Each module class must implement the definition function. The definition consists of components
    // that describes the module's functionality and behavior.
    // See https://docs.expo.dev/modules/module-api for more details about available components.
    public func definition() -> ModuleDefinition {
        // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
        // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
        // The module will be accessible from `requireNativeModule('RelistenAudioPlayer')` in JavaScript.
        Name("RelistenAudioPlayer")

        OnCreate {
            player = RelistenGaplessAudioPlayer()
            player?.delegate = self
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
            return player?.currentDuration
        }

        Function("currentState") {
            return player?.currentState ?? .Stopped
        }

        Function("currentStateStr") {
            return String(describing: player?.currentState ?? .Stopped)
        }

        Function("elapsed") {
            return player?.elapsed
        }

        Function("volume") {
            return player?.volume ?? 0.0
        }

        Function("setVolume") { (newVolume: Float) in
            return player?.volume = newVolume
        }

        Function("prepareAudioSession") {
            player?.prepareAudioSession()
        }

        AsyncFunction("playbackProgress") { (promise: Promise) in
            player?.bassQueue.async {
                guard let player = self.player else {
                    promise.resolve(["playbackProgress": nil] as [String: Any?])
                    return
                }

                promise.resolve([
                    "playbackProgress": [
                        "elapsed": player.elapsed,
                        "duration": player.currentDuration
                    ] as [String: TimeInterval?],
                    "activeTrackDownloadProgress": [
                        "forActiveTrack": true,
                        "downloadedBytes": player.activeTrackDownloadedBytes as Any,
                        "totalBytes": player.activeTrackTotalBytes as Any
                    ] as [String: Any]
                ] as [String: Any])
            }
        }

        AsyncFunction("play") { (streamable: RelistenStreamable, startingAtMs: Int64?, promise: Promise) in
            guard let url = streamable.url, let identifier = streamable.identifier, let title = streamable.title, let albumArt = streamable.albumArt, let albumTitle = streamable.albumTitle, let artist = streamable.artist else {
                promise.resolve()
                return
            }

            player?.bassQueue.async {
                self.player?.play(
                    RelistenGaplessStreamable(
                        url: url,
                        identifier: identifier,
                        title: title,
                        artist: artist,
                        albumTitle: albumTitle,
                        albumArt: albumArt,
                        downloadDestination: streamable.downloadDestination
                    ),
                    startingAtMs: startingAtMs
                )
                promise.resolve()
            }
        }

        Function("setNextStream") { (streamable: RelistenStreamable?) in
            if streamable == nil, let player = self.player {
                player.bassQueue.async {
                    self.player?.setNextStream(nil)
                }
            }

            guard let streamable = streamable, let url = streamable.url, let identifier = streamable.identifier, let title = streamable.title, let albumTitle = streamable.albumTitle, let albumArt = streamable.albumArt, let artist = streamable.artist else {
                return
            }
            
            player?.bassQueue.async {
                self.player?.setNextStream(
                    RelistenGaplessStreamable(
                        url: url,
                        identifier: identifier,
                        title: title,
                        artist: artist,
                        albumTitle: albumTitle,
                        albumArt: albumArt,
                        downloadDestination: streamable.downloadDestination
                    )
                )
            }
        }

        AsyncFunction("resume") { (promise: Promise) in
            player?.bassQueue.async {
                self.player?.resume()
                promise.resolve()
            }
        }

        AsyncFunction("pause") { (promise: Promise) in
            player?.bassQueue.async {
                self.player?.pause()
                promise.resolve()
            }
        }

        AsyncFunction("stop") { (promise: Promise) in
            player?.bassQueue.async {
                self.player?.stop()
                promise.resolve()
            }
        }

        AsyncFunction("next") { (promise: Promise) in
            player?.bassQueue.async {
                self.player?.next()
                promise.resolve()
            }
        }

        AsyncFunction("seekTo") { (pct: Double, promise: Promise) in
            player?.bassQueue.async {
                self.player?.seekTo(percent: pct)
                promise.resolve()
            }
        }
        
        AsyncFunction("seekToTime") { (timeMs: Int64, promise: Promise) in
            player?.bassQueue.async {
                self.player?.seekToTime(timeMs)
                promise.resolve()
            }
        }
    }
}

extension RelistenAudioPlayerModule: RelistenGaplessAudioPlayerDelegate {
    public func streamingCacheCompleted(forStreamable streamable: RelistenGaplessStreamable, bytesWritten: Int) {
        self.sendEvent("onTrackStreamingCacheComplete", [
            "identifier": streamable.identifier,
            "totalBytes": bytesWritten
        ])
    }
    
    public func errorStartingStream(_ player: RelistenGaplessAudioPlayer, error: NSError, forStreamable: RelistenGaplessStreamable) {
        self.sendEvent("onError", [
            "error": error.code,
            "errorDescription": error.localizedDescription,
            "identifier": forStreamable.identifier
        ])
    }

    public func playbackStateChanged(_ player: RelistenGaplessAudioPlayer, newPlaybackState playbackState: PlaybackState) {
        self.sendEvent("onPlaybackStateChanged", [
            "newPlaybackState": String(describing: playbackState)
        ])
    }

    public func playbackProgressChanged(_ player: RelistenGaplessAudioPlayer, elapsed: TimeInterval?, duration: TimeInterval?) {
        self.sendEvent("onPlaybackProgressChanged", [
            "elapsed": elapsed,
            "duration": duration
        ])
    }

    public func downloadProgressChanged(_ player: RelistenGaplessAudioPlayer, forActiveTrack: Bool, downloadedBytes: UInt64, totalBytes: UInt64) {
        NSLog("[downloadProgressChanged] %d / %d", downloadedBytes, totalBytes)
        self.sendEvent("onDownloadProgressChanged", [
            "forActiveTrack": forActiveTrack,
            "downloadedBytes": downloadedBytes,
            "totalBytes": totalBytes
        ])
    }

    public func trackChanged(_ player: RelistenGaplessAudioPlayer, previousStreamable: RelistenGaplessStreamable?, currentStreamable: RelistenGaplessStreamable?) {
        self.sendEvent("onTrackChanged", [
            "previousIdentifier": previousStreamable?.identifier,
            "currentIdentifier": currentStreamable?.identifier
        ])
    }

    public func remoteControl(method: String) {
        self.sendEvent("onRemoteControl", [
            "method": method
        ])
    }

    public func audioSessionWasSetup(_ player: RelistenGaplessAudioPlayer) {

    }
}
