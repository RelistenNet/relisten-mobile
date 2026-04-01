import Foundation

/// Public error surface for preparation, decode, and playback setup failures.
public enum GaplessMP3PlayerError: Error, LocalizedError, Sendable {
    case unsupportedSourceScheme(String)
    case insufficientData(String)
    case invalidMP3(String)
    case unsupportedFormat(String)
    case sourceIdentityMismatch(String)
    case sourceNotPrepared
    case missingCurrentSource
    case incompatibleTrackFormats

    public var errorDescription: String? {
        switch self {
        case .unsupportedSourceScheme(let scheme):
            "Unsupported source scheme: \(scheme)"
        case .insufficientData(let message):
            "Insufficient data: \(message)"
        case .invalidMP3(let message):
            "Invalid MP3: \(message)"
        case .unsupportedFormat(let message):
            "Unsupported format: \(message)"
        case .sourceIdentityMismatch(let message):
            "Source identity mismatch: \(message)"
        case .sourceNotPrepared:
            "Source has not been prepared"
        case .missingCurrentSource:
            "No current source is available"
        case .incompatibleTrackFormats:
            "Tracks must share the same sample rate and channel count"
        }
    }
}
