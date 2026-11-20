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

        // MPVolumeView draws its slider at the top; center it in the row.
        let height = volumeView.sizeThatFits(bounds.size).height
        volumeView.frame = CGRect(
            x: 0,
            y: (bounds.height - height) / 2,
            width: bounds.width,
            height: height
        )
        applyTint()
    }

    /// The slider is a private subview, only reachable once laid out.
    private func applyTint() {
        guard let slider = volumeView.subviews.compactMap({ $0 as? UISlider }).first else {
            return
        }
        slider.minimumTrackTintColor = tint
        slider.maximumTrackTintColor = UIColor(white: 1, alpha: 0.52)
    }
}
