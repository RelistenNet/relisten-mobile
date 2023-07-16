import ExpoModulesCore

// import bass

struct RelistenStreamable: Record {
    @Field
    var url: URL? = nil

    @Field
    var identifier: String? = nil
}

public class RelistenAudioPlayerModule: Module {
    var player: RelistenGaplessAudioPlayer? = nil

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

        Events("onError")
        Events("onPlaybackStateChanged")
        Events("onPlaybackProgressChanged")
        Events("onDownloadProgressChanged")
        Events("onTrackChanged")

        Function("currentDuration") {
            return player?.currentDuration
        }

        Function("currentState") {
            return player?.currentState ?? .Stopped
        }

        Function("elapsed") {
            return player?.elapsed
        }

        Function("volume") {
            return player?.volume
        }

        Function("setVolume") { (newVolume: Float) in
            return player?.volume = newVolume
        }

        Function("prepareAudioSession") {
            player?.prepareAudioSession()
        }

        Function("play") { (streamable: RelistenStreamable) in
            guard let url = streamable.url, let identifier = streamable.identifier else {
                return
            }

            player?.play(RelistenGaplessStreamable(url: url, identifier: identifier))
        }

        Function("setNextStream"){ (streamable: RelistenStreamable) in
            guard let url = streamable.url, let identifier = streamable.identifier else {
                return
            }

            player?.setNextStream(RelistenGaplessStreamable(url: url, identifier: identifier))
        }

        Function("resume") {
            player?.resume()
        }

        Function("pause") {
            player?.pause()
        }

        Function("stop") {
            player?.stop()
        }

        Function("next") {
            player?.next()
        }

        Function("seekTo") { (pct: Double) in
            player?.seekTo(percent: pct)
        }
    }
}

extension RelistenAudioPlayerModule: RelistenGaplessAudioPlayerDelegate {
    public func errorStartingStream(_ player: RelistenGaplessAudioPlayer, error: NSError, forStreamable: RelistenGaplessStreamable) {
        self.sendEvent("onError", [
            "error": error.code,
            "errorDescription": error.localizedDescription,
            "identifier": forStreamable.identifier,
        ])
    }

    public func playbackStateChanged(_ player: RelistenGaplessAudioPlayer, newPlaybackState playbackState: PlaybackState) {
        self.sendEvent("onPlaybackStateChanged", [
            "newPlaybackState": String(describing: playbackState),
        ])
    }

    public func playbackProgressChanged(_ player: RelistenGaplessAudioPlayer, elapsed: TimeInterval?, duration: TimeInterval?) {
        self.sendEvent("onPlaybackProgressChanged", [
            "elapsed": elapsed,
            "duration": duration,
        ])
    }

    public func downloadProgressChanged(_ player: RelistenGaplessAudioPlayer, forActiveTrack: Bool, downloadedBytes: UInt64, totalBytes: UInt64) {
        self.sendEvent("onDownloadProgressChanged", [
            "forActiveTrack": forActiveTrack,
            "downloadedBytes": downloadedBytes,
            "totalBytes": totalBytes,
        ])
    }

    public func trackChanged(_ player: RelistenGaplessAudioPlayer, previousStreamable: RelistenGaplessStreamable, currentStreamable: RelistenGaplessStreamable?) {
        self.sendEvent("onTrackChanged", [
            "previousIdentifier": previousStreamable.identifier,
            "currentIdentifier": currentStreamable?.identifier,
        ])
    }

    public func audioSessionWasSetup(_ player: RelistenGaplessAudioPlayer) {

    }
}
