import Accelerate
import Foundation

final class SpectrumBandAnalyzer {
    static let bandCount = 48
    static let fftSize = 2_048

    private static let minimumFrequency = 50.0
    private static let maximumFrequency = 16_000.0
    private static let dynamicRangeDB: Float = 48
    private static let noiseFloorDB: Float = -80
    private static let peakReleaseDBPerSecond: Float = 12

    private let fftSetup: FFTSetup
    private let window: [Float]
    private var windowedSamples = [Float](repeating: 0, count: fftSize)
    private var real = [Float](repeating: 0, count: fftSize / 2)
    private var imaginary = [Float](repeating: 0, count: fftSize / 2)
    private var power = [Float](repeating: 0, count: fftSize / 2)
    private var rollingPeakDB = -Float.infinity

    init?() {
        guard let fftSetup = vDSP_create_fftsetup(
            vDSP_Length(log2(Float(Self.fftSize))),
            FFTRadix(kFFTRadix2)
        ) else {
            return nil
        }

        self.fftSetup = fftSetup
        var window = [Float](repeating: 0, count: Self.fftSize)
        vDSP_hann_window(&window, vDSP_Length(Self.fftSize), Int32(vDSP_HANN_NORM))
        self.window = window
    }

    deinit {
        vDSP_destroy_fftsetup(fftSetup)
    }

    func analyze(
        samples: [Float],
        sampleRate: Double,
        deltaTime: TimeInterval
    ) -> [Float] {
        guard sampleRate > 0 else {
            return Self.flatBands
        }

        let copiedCount = min(samples.count, Self.fftSize)
        windowedSamples.withUnsafeMutableBufferPointer { destination in
            guard let destinationAddress = destination.baseAddress else { return }
            vDSP_vclr(destinationAddress, 1, vDSP_Length(destination.count))
            if copiedCount > 0 {
                samples.withUnsafeBufferPointer { source in
                    destinationAddress.update(from: source.baseAddress!, count: copiedCount)
                }
            }
        }
        vDSP_vmul(
            windowedSamples,
            1,
            window,
            1,
            &windowedSamples,
            1,
            vDSP_Length(Self.fftSize)
        )

        real.withUnsafeMutableBufferPointer { realBuffer in
            imaginary.withUnsafeMutableBufferPointer { imaginaryBuffer in
                var splitComplex = DSPSplitComplex(
                    realp: realBuffer.baseAddress!,
                    imagp: imaginaryBuffer.baseAddress!
                )

                windowedSamples.withUnsafeBytes { rawSamples in
                    let complexSamples = rawSamples.bindMemory(to: DSPComplex.self)
                    vDSP_ctoz(
                        complexSamples.baseAddress!,
                        2,
                        &splitComplex,
                        1,
                        vDSP_Length(Self.fftSize / 2)
                    )
                }

                vDSP_fft_zrip(
                    fftSetup,
                    &splitComplex,
                    1,
                    vDSP_Length(log2(Float(Self.fftSize))),
                    FFTDirection(kFFTDirection_Forward)
                )
                vDSP_zvmags(
                    &splitComplex,
                    1,
                    &power,
                    1,
                    vDSP_Length(Self.fftSize / 2)
                )
            }
        }

        var powerScale = 4 / Float(Self.fftSize * Self.fftSize)
        vDSP_vsmul(
            power,
            1,
            &powerScale,
            &power,
            1,
            vDSP_Length(power.count)
        )

        let bandPower = aggregateBands(sampleRate: sampleRate)
        guard let peakPower = bandPower.max(), peakPower > 0 else {
            rollingPeakDB = -Float.infinity
            return Self.flatBands
        }

        let peakDB = 10 * log10(max(peakPower, Float.leastNonzeroMagnitude))
        guard peakDB > Self.noiseFloorDB else {
            return Self.flatBands
        }

        if rollingPeakDB.isFinite {
            rollingPeakDB = max(
                peakDB,
                rollingPeakDB - Self.peakReleaseDBPerSecond * Float(max(deltaTime, 0))
            )
        } else {
            rollingPeakDB = peakDB
        }

        let lowerBoundDB = max(Self.noiseFloorDB, rollingPeakDB - Self.dynamicRangeDB)
        let normalizationRange = max(rollingPeakDB - lowerBoundDB, 1)

        return bandPower.map { value in
            guard value > 0 else { return 0 }
            let valueDB = 10 * log10(max(value, Float.leastNonzeroMagnitude))
            return min(max((valueDB - lowerBoundDB) / normalizationRange, 0), 1)
        }
    }

    private func aggregateBands(sampleRate: Double) -> [Float] {
        let upperFrequency = min(Self.maximumFrequency, sampleRate / 2)
        guard upperFrequency > Self.minimumFrequency else {
            return Self.flatBands
        }

        let frequencyRatio = upperFrequency / Self.minimumFrequency
        return (0..<Self.bandCount).map { band in
            let lowerFraction = Double(band) / Double(Self.bandCount)
            let upperFraction = Double(band + 1) / Double(Self.bandCount)
            let lowerFrequency = Self.minimumFrequency * pow(frequencyRatio, lowerFraction)
            let upperFrequency = Self.minimumFrequency * pow(frequencyRatio, upperFraction)
            let lowerBin = max(1, Int(floor(lowerFrequency * Double(Self.fftSize) / sampleRate)))
            let upperBin = min(
                power.count,
                max(lowerBin + 1, Int(ceil(upperFrequency * Double(Self.fftSize) / sampleRate)))
            )

            guard lowerBin < upperBin else { return 0 }
            return power[lowerBin..<upperBin].max() ?? 0
        }
    }

    static var flatBands: [Float] {
        [Float](repeating: 0, count: bandCount)
    }
}

struct SpectrumSmoother {
    private(set) var values: [Float]
    let attackTime: TimeInterval
    let releaseTime: TimeInterval

    init(
        bandCount: Int = SpectrumBandAnalyzer.bandCount,
        attackTime: TimeInterval = 0.045,
        releaseTime: TimeInterval = 0.22
    ) {
        values = [Float](repeating: 0, count: bandCount)
        self.attackTime = attackTime
        self.releaseTime = releaseTime
    }

    mutating func update(targets: [Float], deltaTime: TimeInterval) {
        let count = min(values.count, targets.count)
        for index in 0..<count {
            let target = min(max(targets[index], 0), 1)
            let timeConstant = target > values[index] ? attackTime : releaseTime
            let coefficient = Float(1 - exp(-max(deltaTime, 0) / max(timeConstant, 0.001)))
            values[index] += (target - values[index]) * coefficient
        }
    }
}
