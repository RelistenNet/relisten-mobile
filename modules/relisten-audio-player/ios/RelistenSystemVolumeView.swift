import ExpoModulesCore
import MediaPlayer
import UIKit

/// The system volume slider. It controls whatever route iOS is playing to,
/// this phone or an AirPlay speaker, the same way Control Center does; apps
/// can't set that volume any other way.
final class RelistenSystemVolumeView: ExpoView {
    private let volumeView = MPVolumeView(frame: .zero)

    var tint: UIColor? {
        didSet { applyTint() }
    }

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)

        backgroundColor = .clear
        volumeView.showsVolumeSlider = true
        addSubview(volumeView)
    }

    override func layoutSubviews() {
        super.layoutSubviews()

        // MPVolumeView places its slider itself, not at its own vertical center,
        // so lay it out first, then shift it until the slider sits on the row's
        // center line, level with the icons beside it.
        volumeView.frame = bounds
        volumeView.layoutIfNeeded()
        if let slider = volumeSlider() {
            volumeView.frame.origin.y = bounds.midY - slider.frame.midY
        }
        applyTint()
    }

    /// The slider is a private subview, only reachable once laid out.
    private func volumeSlider() -> UISlider? {
        volumeView.subviews.compactMap { $0 as? UISlider }.first
    }

    private func applyTint() {
        guard let slider = volumeSlider() else {
            return
        }
        slider.minimumTrackTintColor = tint
        slider.maximumTrackTintColor = UIColor(white: 1, alpha: 0.52)
    }
}
