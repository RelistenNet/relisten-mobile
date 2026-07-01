import Foundation

enum AudioAdjustmentConfigurationError: Error, LocalizedError {
    case invalidSpecVersion(Int)
    case invalidBandCount(Int)
    case invalidBandGain(Double)
    case invalidVolumeReduction(Double)

    var errorDescription: String? {
        switch self {
        case let .invalidSpecVersion(version):
            return "Unsupported audio adjustment specification version: \(version)"
        case let .invalidBandCount(count):
            return "Audio adjustments require exactly 10 bands, received \(count)"
        case let .invalidBandGain(gain):
            return "Invalid audio adjustment band gain: \(gain)"
        case let .invalidVolumeReduction(reduction):
            return "Invalid extra volume reduction: \(reduction)"
        }
    }
}

struct AudioAdjustmentConfiguration: Sendable, Equatable {
    static let specVersion = 1
    static let frequenciesHz: [Float] = [
        31, 62, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000,
    ]
    static let minimumBandGainDb: Float = -12
    static let maximumBandGainDb: Float = 12
    static let minimumVolumeReductionDb: Float = -30
    static let maximumVolumeReductionDb: Float = 0

    static let disabled = AudioAdjustmentConfiguration(
        enabled: false,
        bandGainsDb: Array(repeating: 0, count: frequenciesHz.count),
        extraVolumeReductionDb: 0
    )

    let enabled: Bool
    let bandGainsDb: [Float]
    let extraVolumeReductionDb: Float

    init(
        enabled: Bool,
        bandGainsDb: [Float],
        extraVolumeReductionDb: Float
    ) {
        precondition(bandGainsDb.count == Self.frequenciesHz.count)
        self.enabled = enabled
        self.bandGainsDb = bandGainsDb
        self.extraVolumeReductionDb = extraVolumeReductionDb
    }

    static func validated(
        specVersion: Int,
        enabled: Bool,
        bandGainsDb: [Double],
        extraVolumeReductionDb: Double
    ) throws -> AudioAdjustmentConfiguration {
        guard specVersion == Self.specVersion else {
            throw AudioAdjustmentConfigurationError.invalidSpecVersion(specVersion)
        }
        guard bandGainsDb.count == frequenciesHz.count else {
            throw AudioAdjustmentConfigurationError.invalidBandCount(bandGainsDb.count)
        }
        guard extraVolumeReductionDb.isFinite,
              extraVolumeReductionDb >= Double(minimumVolumeReductionDb),
              extraVolumeReductionDb <= Double(maximumVolumeReductionDb) else {
            throw AudioAdjustmentConfigurationError.invalidVolumeReduction(extraVolumeReductionDb)
        }

        let gains = try bandGainsDb.map { gain -> Float in
            guard gain.isFinite,
                  gain >= Double(minimumBandGainDb),
                  gain <= Double(maximumBandGainDb) else {
                throw AudioAdjustmentConfigurationError.invalidBandGain(gain)
            }
            return Float(gain)
        }

        return AudioAdjustmentConfiguration(
            enabled: enabled,
            bandGainsDb: gains,
            extraVolumeReductionDb: Float(extraVolumeReductionDb)
        )
    }

    var automaticHeadroomDb: Float {
        let largestBoost = max(bandGainsDb.max() ?? 0, 0)
        return largestBoost > 0 ? largestBoost + 1 : 0
    }

    var effectiveGlobalGainDb: Float {
        extraVolumeReductionDb - automaticHeadroomDb
    }

    static var capabilitiesDictionary: [String: Any] {
        [
            "supported": true,
            "specVersion": specVersion,
            "frequenciesHz": frequenciesHz.map(Double.init),
            "bandGainMinimumDb": Double(minimumBandGainDb),
            "bandGainMaximumDb": Double(maximumBandGainDb),
            "volumeReductionMaximumDb": Double(maximumVolumeReductionDb),
            "volumeReductionMinimumDb": Double(minimumVolumeReductionDb),
        ]
    }
}
