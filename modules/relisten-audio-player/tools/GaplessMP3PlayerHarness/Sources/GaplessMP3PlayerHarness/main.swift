import Foundation
import GaplessMP3Player

@main
struct HarnessMain {
    static func main() async {
        let player = GaplessMP3Player()
        let status = await player.status()

        print("GaplessMP3PlayerHarness")
        print("isPlaying=\(status.isPlaying)")
        print("isReadyToPlay=\(status.isReadyToPlay)")
        print("currentTime=\(status.currentTime)")
        if let duration = status.duration {
            print("duration=\(duration)")
        } else {
            print("duration=nil")
        }
    }
}
