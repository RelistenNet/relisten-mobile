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
