import ExpoModulesCore
import UIKit

final class RelistenAudioSpectrumView: ExpoView {
    private static let staleFrameInterval: TimeInterval = 0.15

    private let barLayer = CAShapeLayer()
    private let baselineLayer = CAShapeLayer()
    private let snapshotStore = SpectrumSnapshotStore.shared
    private var displayLink: CADisplayLink?
    private var isApplicationActive = UIApplication.shared.applicationState == .active
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
        barLayer.actions = [
            "lineWidth": NSNull(),
            "path": NSNull(),
            "strokeColor": NSNull(),
        ]
        layer.addSublayer(barLayer)

        baselineLayer.fillColor = nil
        baselineLayer.lineCap = .round
        baselineLayer.opacity = 0.3
        baselineLayer.actions = [
            "path": NSNull(),
            "strokeColor": NSNull(),
        ]
        layer.addSublayer(baselineLayer)

        updateLayerColors()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(reduceMotionStatusDidChange),
            name: UIAccessibility.reduceMotionStatusDidChangeNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationWillResignActive),
            name: UIApplication.willResignActiveNotification,
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
        baselineLayer.frame = bounds
        updatePaths()
    }

    @objc
    private func reduceMotionStatusDidChange() {
        updateConsumption()
        if UIAccessibility.isReduceMotionEnabled {
            resetSpectrum()
            stopDisplayLink()
        } else {
            startDisplayLink()
        }
    }

    @objc
    private func applicationDidBecomeActive() {
        isApplicationActive = true
        updateConsumption()
        startDisplayLink()
    }

    @objc
    private func applicationWillResignActive() {
        isApplicationActive = false
        updateConsumption()
        resetSpectrum()
        stopDisplayLink()
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
        let shouldConsume = window != nil
            && isActive
            && isApplicationActive
            && !UIAccessibility.isReduceMotionEnabled

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
        guard window != nil, isApplicationActive, !UIAccessibility.isReduceMotionEnabled else {
            return
        }

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
        baselineLayer.strokeColor = spectrumColor.cgColor
    }

    private func resetSpectrum() {
        smoother = SpectrumSmoother()
        updatePaths()
    }

    private func updatePaths() {
        guard bounds.width > 0, bounds.height > 0 else { return }

        let bandCount = smoother.values.count
        let horizontalStep = bounds.width / CGFloat(bandCount)
        let strokeWidth = min(max(horizontalStep * 0.28, 1.5), 2)
        let baselineY = bounds.height - strokeWidth / 2
        let maximumHeight = max(0, bounds.height - strokeWidth)
        let barsPath = UIBezierPath()

        for (index, amplitude) in smoother.values.enumerated() where amplitude > 0.001 {
            let x = (CGFloat(index) + 0.5) * horizontalStep
            let barHeight = max(CGFloat(amplitude) * maximumHeight, 0.75)
            barsPath.move(to: CGPoint(x: x, y: baselineY))
            barsPath.addLine(to: CGPoint(x: x, y: baselineY - barHeight))
        }

        let baselinePath = UIBezierPath()
        // Resting dots share the bars' centers; an independent dashed line
        // produces stray marks beside each live bar.
        for index in 0..<bandCount {
            let x = (CGFloat(index) + 0.5) * horizontalStep
            baselinePath.move(to: CGPoint(x: x, y: baselineY))
            baselinePath.addLine(to: CGPoint(x: x, y: baselineY - 0.01))
        }

        barLayer.lineWidth = strokeWidth
        baselineLayer.lineWidth = strokeWidth
        barLayer.path = barsPath.cgPath
        baselineLayer.path = baselinePath.cgPath
    }
}
