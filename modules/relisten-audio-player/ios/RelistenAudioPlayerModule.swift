import ExpoModulesCore

// import bass

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

        AsyncFunction("play") { () in
            player?.play(RelistenGaplessStreamable(url: URL(string: "https://archive.org/download/gd1977-05-08.148737.SBD.Betty.Anon.Noel.t-flac2448/gd77-05-08.s2t02.mp3")!, identifier: "test"))
            player?.setNextStream(RelistenGaplessStreamable(url: URL(string: "https://archive.org/download/gd1977-05-08.148737.SBD.Betty.Anon.Noel.t-flac2448/gd77-05-08.s2t03.mp3")!, identifier: "test2"))

            DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(5)) { [self] in
                player?.seekTo(percent: 0.98)
            }
        }

        // Defines a JavaScript function that always returns a Promise and whose native code
        // is by default dispatched on the different thread than the JavaScript runtime runs on.
        AsyncFunction("setValueAsync") { (value: String) in
            // Send an event to JavaScript.
            self.sendEvent("onChange", [
                "value": value,
            ])
        }
    }
}

extension RelistenAudioPlayerModule: RelistenGaplessAudioPlayerDelegate {
    public func errorStartingStream(_ player: RelistenGaplessAudioPlayer, error: NSError, forStreamable: RelistenGaplessStreamable) {
        
    }
    
    public func playbackStateChanged(_ player: RelistenGaplessAudioPlayer, newPlaybackState playbackState: PlaybackState) {
        
    }
    
    public func playbackProgressChanged(_ player: RelistenGaplessAudioPlayer, elapsed: TimeInterval?, duration: TimeInterval?) {
        
    }
    
    public func downloadProgressChanged(_ player: RelistenGaplessAudioPlayer, forActiveTrack: Bool, downloadedBytes: UInt64, totalBytes: UInt64) {
        
    }
    
    public func trackChanged(_ player: RelistenGaplessAudioPlayer, previousStreamable: RelistenGaplessStreamable, currentStreamable: RelistenGaplessStreamable?) {
        
    }
    
    public func audioSessionWasSetup(_ player: RelistenGaplessAudioPlayer) {
        
    }
}
