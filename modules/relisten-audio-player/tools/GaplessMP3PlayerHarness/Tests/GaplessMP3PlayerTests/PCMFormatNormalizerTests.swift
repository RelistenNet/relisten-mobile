import XCTest
@testable import GaplessMP3Player

final class PCMFormatNormalizerTests: XCTestCase {
    func testSameFormatPassesThrough() throws {
        let normalizer = try PCMFormatNormalizer(
            inputSampleRate: 44_100,
            inputChannelCount: 2,
            outputFormat: .bassLike
        )
        let input = PCMChunk(sampleRate: 44_100, channels: [[0, 0.5, 1], [1, 0.5, 0]])

        let output = try XCTUnwrap(normalizer.normalize(input))

        XCTAssertEqual(output.sampleRate, 44_100)
        XCTAssertEqual(output.channelCount, 2)
        XCTAssertEqual(output.channels[0], input.channels[0])
        XCTAssertEqual(output.channels[1], input.channels[1])
    }

    func testMonoIsDuplicatedToStereoWithoutResample() throws {
        let normalizer = try PCMFormatNormalizer(
            inputSampleRate: 44_100,
            inputChannelCount: 1,
            outputFormat: .bassLike
        )
        let input = PCMChunk(sampleRate: 44_100, channels: [[0, 0.25, 0.5, 1]])

        let output = try XCTUnwrap(normalizer.normalize(input))

        XCTAssertEqual(output.sampleRate, 44_100)
        XCTAssertEqual(output.channelCount, 2)
        XCTAssertEqual(output.channels[0], input.channels[0])
        XCTAssertEqual(output.channels[1], input.channels[0])
    }

    func testStereoIsAveragedToMonoWithoutResample() throws {
        let normalizer = try PCMFormatNormalizer(
            inputSampleRate: 44_100,
            inputChannelCount: 2,
            outputFormat: PlaybackSessionOutputFormat(sampleRate: 44_100, channelCount: 1)
        )
        let input = PCMChunk(sampleRate: 44_100, channels: [[1, 0.5, 0], [0, 0.5, 1]])

        let output = try XCTUnwrap(normalizer.normalize(input))

        XCTAssertEqual(output.sampleRate, 44_100)
        XCTAssertEqual(output.channelCount, 1)
        XCTAssertEqual(output.channels[0], [0.5, 0.5, 0.5])
    }

    func testUnsupportedChannelCountsRejectCleanly() {
        XCTAssertThrowsError(
            try PCMFormatNormalizer(
                inputSampleRate: 44_100,
                inputChannelCount: 3,
                outputFormat: .bassLike
            )
        )
    }

    func testResampleAndFlushPreserveApproximateDuration() throws {
        let normalizer = try PCMFormatNormalizer(
            inputSampleRate: 48_000,
            inputChannelCount: 2,
            outputFormat: .bassLike
        )
        let chunkA = PCMChunk(
            sampleRate: 48_000,
            channels: [
                Array(repeating: 0.25, count: 240),
                Array(repeating: -0.25, count: 240),
            ]
        )
        let chunkB = PCMChunk(
            sampleRate: 48_000,
            channels: [
                Array(repeating: 0.5, count: 240),
                Array(repeating: -0.5, count: 240),
            ]
        )

        var outputs: [PCMChunk] = []
        if let output = try normalizer.normalize(chunkA) {
            outputs.append(output)
        }
        if let output = try normalizer.normalize(chunkB) {
            outputs.append(output)
        }
        if let flushed = try normalizer.flush() {
            outputs.append(flushed)
        }

        let totalDuration = outputs.reduce(0.0) { $0 + (Double($1.frameCount) / $1.sampleRate) }
        XCTAssertEqual(totalDuration, 480.0 / 48_000.0, accuracy: 0.002)
        XCTAssertNil(try normalizer.flush())
    }
}
