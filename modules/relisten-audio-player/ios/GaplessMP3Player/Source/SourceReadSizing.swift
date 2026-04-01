import Foundation

enum SourceReadSizing {
    static let decoderReadSize = 32 * 1024
    static let progressiveYieldSize = 32 * 1024
    static let defaultSeekRangeRequestSizeBytes: Int64 = 1_024 * 1_024
    static let defaultSeekRangePrefetchLowWatermarkBytes: Int64 = 512 * 1_024
}
