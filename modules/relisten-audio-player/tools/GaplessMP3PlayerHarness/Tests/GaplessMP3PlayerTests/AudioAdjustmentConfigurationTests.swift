import XCTest
@testable import GaplessMP3Player

final class AudioAdjustmentConfigurationTests: XCTestCase {
    func testValidConfigurationCalculatesAutomaticHeadroom() throws {
        let configuration = try AudioAdjustmentConfiguration.validated(
            specVersion: 1,
            enabled: true,
            bandGainsDb: [-4, -3, -1, 0, 1, 2, 6, 1, 0, -1],
            extraVolumeReductionDb: -12
        )

        XCTAssertEqual(configuration.automaticHeadroomDb, 7)
        XCTAssertEqual(configuration.effectiveGlobalGainDb, -19)
    }

    func testFlatConfigurationDoesNotAddHeadroom() throws {
        let configuration = try AudioAdjustmentConfiguration.validated(
            specVersion: 1,
            enabled: true,
            bandGainsDb: Array(repeating: 0, count: 10),
            extraVolumeReductionDb: -18
        )

        XCTAssertEqual(configuration.automaticHeadroomDb, 0)
        XCTAssertEqual(configuration.effectiveGlobalGainDb, -18)
    }

    func testSignedGainAndHeadroom() throws {
        for gain in [-30.0, 0, 6, 12] {
            let configuration = try AudioAdjustmentConfiguration.validated(
                specVersion: 1, enabled: true,
                bandGainsDb: Array(repeating: 0, count: 10),
                extraVolumeReductionDb: gain
            )
            XCTAssertEqual(configuration.effectiveGlobalGainDb, Float(gain))
        }
        let boostedCurve = try AudioAdjustmentConfiguration.validated(
            specVersion: 1, enabled: true,
            bandGainsDb: [6] + Array(repeating: 0, count: 9),
            extraVolumeReductionDb: 12
        )
        XCTAssertEqual(boostedCurve.automaticHeadroomDb, 7)
        XCTAssertEqual(boostedCurve.effectiveGlobalGainDb, 5)
        XCTAssertEqual(AudioAdjustmentConfiguration.capabilitiesDictionary["volumeReductionMaximumDb"] as? Double, 12)
        for invalid in [13.0, -31, .nan, .infinity] {
            XCTAssertThrowsError(try AudioAdjustmentConfiguration.validated(
                specVersion: 1, enabled: true,
                bandGainsDb: Array(repeating: 0, count: 10),
                extraVolumeReductionDb: invalid
            ))
        }
    }

    func testRejectsUnsupportedSpecVersion() {
        XCTAssertThrowsError(
            try AudioAdjustmentConfiguration.validated(
                specVersion: 2,
                enabled: true,
                bandGainsDb: Array(repeating: 0, count: 10),
                extraVolumeReductionDb: 0
            )
        )
    }

    func testRejectsWrongBandCount() {
        XCTAssertThrowsError(
            try AudioAdjustmentConfiguration.validated(
                specVersion: 1,
                enabled: true,
                bandGainsDb: [0, 0],
                extraVolumeReductionDb: 0
            )
        )
    }

    func testRejectsNonFiniteAndOutOfRangeValues() {
        XCTAssertThrowsError(
            try AudioAdjustmentConfiguration.validated(
                specVersion: 1,
                enabled: true,
                bandGainsDb: [Double.nan] + Array(repeating: 0, count: 9),
                extraVolumeReductionDb: 0
            )
        )
        XCTAssertThrowsError(
            try AudioAdjustmentConfiguration.validated(
                specVersion: 1,
                enabled: true,
                bandGainsDb: [13] + Array(repeating: 0, count: 9),
                extraVolumeReductionDb: 0
            )
        )
        XCTAssertThrowsError(
            try AudioAdjustmentConfiguration.validated(
                specVersion: 1,
                enabled: true,
                bandGainsDb: Array(repeating: 0, count: 10),
                extraVolumeReductionDb: -31
            )
        )
    }
}
