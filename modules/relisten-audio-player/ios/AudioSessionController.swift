import MediaPlayer
import UIKit

final class AudioSessionController {
    let commandCenter = MPRemoteCommandCenter.shared()

    func beginReceivingRemoteControlEvents() {
        if Thread.isMainThread {
            UIApplication.shared.beginReceivingRemoteControlEvents()
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.beginReceivingRemoteControlEvents()
        }
    }

    func endReceivingRemoteControlEvents() {
        if Thread.isMainThread {
            UIApplication.shared.endReceivingRemoteControlEvents()
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.endReceivingRemoteControlEvents()
        }
    }

    func teardown() {
        endReceivingRemoteControlEvents()
    }
}
