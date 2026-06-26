import ExpoModulesCore
import UIKit

final class RelistenAudioSpectrumView: ExpoView {
    private static let staleFrameInterval: TimeInterval = 0.15

    private let barLayer = CAShapeLayer()
    private let centerLineLayer = CAShapeLayer()
    private let snapshotStore = SpectrumSnapshotStore.shared
    private var displayLink: CADisplayLink?
    private var isConsuming = false
    private var lastFrameTimestamp: CFTimeInterval?
    private var smoother = SpectrumSmoother()

    var isActive = false {
        didSet {
            updateConsumption()
            if isActive {
                startDisplayLink()
            }
        }
    }

    var spectrumColor = UIColor(
        red: 101 / 255,
        green: 226 / 255,
        blue: 1,
        alpha: 1
    ) {
        didSet { updateLayerColors() }
    }

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)

        backgroundColor = .clear
        clipsToBounds = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true

        barLayer.fillColor = nil
        barLayer.lineCap = .round
        barLayer.opacity = 0.82
        layer.addSublayer(barLayer)

        centerLineLayer.fillColor = nil
        centerLineLayer.lineDashPattern = [1, 3]
        centerLineLayer.lineWidth = 0.75
        centerLineLayer.opacity = 0.3
        layer.addSublayer(centerLineLayer)

        updateLayerColors()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(reduceMotionStatusDidChange),
            name: UIAccessibility.reduceMotionStatusDidChangeNotification,
            object: nil
        )
    }

    deinit {
        stopConsuming()
        stopDisplayLink()
        NotificationCenter.default.removeObserver(self)
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        updateConsumption()

        if window == nil {
            resetSpectrum()
            stopDisplayLink()
        } else {
            startDisplayLink()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        barLayer.frame = bounds
        centerLineLayer.frame = bounds
        updatePaths()
    }

    @objc
    private func reduceMotionStatusDidChange() {
        updateConsumption()
        if UIAccessibility.isReduceMotionEnabled {
            resetSpectrum()
        }
        startDisplayLink()
    }

    @objc
    private func renderFrame(_ displayLink: CADisplayLink) {
        let deltaTime: TimeInterval
        if let lastFrameTimestamp {
            deltaTime = min(max(displayLink.timestamp - lastFrameTimestamp, 0), 0.1)
        } else {
            deltaTime = 1.0 / 30.0
        }
        lastFrameTimestamp = displayLink.timestamp

        let snapshot = snapshotStore.snapshot()
        let hasFreshAudio = isConsuming
            && snapshot.isFresh(
                at: ProcessInfo.processInfo.systemUptime,
                staleAfter: Self.staleFrameInterval
            )
        smoother.update(
            targets: hasFreshAudio ? snapshot.bands : SpectrumBandAnalyzer.flatBands,
            deltaTime: deltaTime
        )
        updatePaths()

        if !isConsuming && smoother.values.allSatisfy({ $0 < 0.001 }) {
            displayLink.isPaused = true
        }
    }

    private func updateConsumption() {
        let shouldConsume = window != nil && isActive && !UIAccessibility.isReduceMotionEnabled

        if shouldConsume && !isConsuming {
            snapshotStore.beginConsuming()
            isConsuming = true
        } else if !shouldConsume && isConsuming {
            stopConsuming()
        }
    }

    private func stopConsuming() {
        guard isConsuming else { return }
        snapshotStore.endConsuming()
        isConsuming = false
    }

    private func startDisplayLink() {
        guard window != nil else { return }

        if displayLink == nil {
            let displayLink = CADisplayLink(target: self, selector: #selector(renderFrame(_:)))
            displayLink.preferredFrameRateRange = CAFrameRateRange(
                minimum: 20,
                maximum: 30,
                preferred: 30
            )
            displayLink.add(to: .main, forMode: .common)
            self.displayLink = displayLink
        }

        lastFrameTimestamp = nil
        displayLink?.isPaused = false
    }

    private func stopDisplayLink() {
        displayLink?.invalidate()
        displayLink = nil
        lastFrameTimestamp = nil
    }

    private func updateLayerColors() {
        barLayer.strokeColor = spectrumColor.cgColor
        centerLineLayer.strokeColor = spectrumColor.cgColor
    }

    private func resetSpectrum() {
        smoother = SpectrumSmoother()
        updatePaths()
    }

    private func updatePaths() {
        guard bounds.width > 0, bounds.height > 0 else { return }

        let bandCount = smoother.values.count
        let horizontalStep = bounds.width / CGFloat(bandCount)
        let centerY = bounds.midY
        let maximumHalfHeight = bounds.height * 0.46
        let barsPath = UIBezierPath()

        for (index, amplitude) in smoother.values.enumerated() where amplitude > 0.001 {
            let x = (CGFloat(index) + 0.5) * horizontalStep
            let halfHeight = max(CGFloat(amplitude) * maximumHalfHeight, 0.75)
            barsPath.move(to: CGPoint(x: x, y: centerY - halfHeight))
            barsPath.addLine(to: CGPoint(x: x, y: centerY + halfHeight))
        }

        let centerPath = UIBezierPath()
        centerPath.move(to: CGPoint(x: 0, y: centerY))
        centerPath.addLine(to: CGPoint(x: bounds.width, y: centerY))

        barLayer.lineWidth = min(max(horizontalStep * 0.34, 1), 3)
        barLayer.path = barsPath.cgPath
        centerLineLayer.path = centerPath.cgPath
    }
}
