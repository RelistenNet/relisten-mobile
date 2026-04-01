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

public enum GaplessPlaybackFailureKind: String, Sendable {
    case invalidSource
    case networkUnavailable
    case networkTimeout
    case sslFailure
    case httpStatus
    case sourceNotFound
    case invalidMedia
    case insufficientData
    case unsupportedFormat
    case incompatibleTracks
    case sourceIdentityMismatch
    case invalidState
    case audioPipeline
    case unknown
}

public struct GaplessPlaybackFailure: Error, LocalizedError, Sendable {
    public let kind: GaplessPlaybackFailureKind
    public let message: String
    public let description: String?
    public let isRetryable: Bool
    public let platformCode: Int?
    public let platformName: String?
    public let httpStatus: Int?

    public init(
        kind: GaplessPlaybackFailureKind,
        message: String,
        description: String?,
        isRetryable: Bool,
        platformCode: Int? = nil,
        platformName: String? = nil,
        httpStatus: Int? = nil
    ) {
        self.kind = kind
        self.message = message
        self.description = description
        self.isRetryable = isRetryable
        self.platformCode = platformCode
        self.platformName = platformName
        self.httpStatus = httpStatus
    }

    public var errorDescription: String? {
        description ?? message
    }
}

extension GaplessPlaybackFailure {
    static func make(from error: Error) -> GaplessPlaybackFailure? {
        if error is CancellationError {
            return nil
        }

        if let failure = error as? GaplessPlaybackFailure {
            return failure
        }

        if let error = error as? GaplessMP3PlayerError {
            switch error {
            case .unsupportedSourceScheme:
                return GaplessPlaybackFailure(
                    kind: .invalidSource,
                    message: "Invalid audio source",
                    description: error.errorDescription,
                    isRetryable: false,
                    platformName: "unsupportedSourceScheme"
                )
            case .insufficientData:
                return GaplessPlaybackFailure(
                    kind: .insufficientData,
                    message: "Incomplete media data",
                    description: error.errorDescription,
                    isRetryable: true,
                    platformName: "insufficientData"
                )
            case .invalidMP3:
                return GaplessPlaybackFailure(
                    kind: .invalidMedia,
                    message: "Invalid media file",
                    description: error.errorDescription,
                    isRetryable: false,
                    platformName: "invalidMP3"
                )
            case .unsupportedFormat:
                return GaplessPlaybackFailure(
                    kind: .unsupportedFormat,
                    message: "Unsupported audio format",
                    description: error.errorDescription,
                    isRetryable: false,
                    platformName: "unsupportedFormat"
                )
            case .sourceIdentityMismatch:
                return GaplessPlaybackFailure(
                    kind: .sourceIdentityMismatch,
                    message: "Track source changed during playback",
                    description: error.errorDescription,
                    isRetryable: true,
                    platformName: "sourceIdentityMismatch"
                )
            case .sourceNotPrepared:
                return GaplessPlaybackFailure(
                    kind: .invalidState,
                    message: "Playback is not ready",
                    description: error.errorDescription,
                    isRetryable: true,
                    platformName: "sourceNotPrepared"
                )
            case .missingCurrentSource:
                return GaplessPlaybackFailure(
                    kind: .invalidState,
                    message: "Playback is not ready",
                    description: error.errorDescription,
                    isRetryable: true,
                    platformName: "missingCurrentSource"
                )
            case .incompatibleTrackFormats:
                return GaplessPlaybackFailure(
                    kind: .incompatibleTracks,
                    message: "Tracks cannot be played together",
                    description: error.errorDescription,
                    isRetryable: false,
                    platformName: "incompatibleTrackFormats"
                )
            }
        }

        if let transportError = error as? HTTPTransportError {
            let description = transportError.errorDescription ?? String(describing: transportError)
            switch transportError {
            case .unexpectedStatus(let statusCode):
                return GaplessPlaybackFailure(
                    kind: .httpStatus,
                    message: "Server returned an invalid response",
                    description: description,
                    isRetryable: statusCode == 408 || statusCode == 429 || (500 ... 599).contains(statusCode),
                    platformName: "unexpectedStatus",
                    httpStatus: statusCode
                )
            case .ignoredRangeRequest(let statusCode):
                return GaplessPlaybackFailure(
                    kind: .httpStatus,
                    message: "Server returned an invalid response",
                    description: description,
                    isRetryable: false,
                    platformName: "ignoredRangeRequest",
                    httpStatus: statusCode
                )
            case .rangeNotSatisfiable:
                return GaplessPlaybackFailure(
                    kind: .httpStatus,
                    message: "Server returned an invalid response",
                    description: description,
                    isRetryable: false,
                    platformName: "rangeNotSatisfiable",
                    httpStatus: 416
                )
            case .nonHTTPResponse:
                return GaplessPlaybackFailure(
                    kind: .invalidSource,
                    message: "Invalid audio source",
                    description: description,
                    isRetryable: false,
                    platformName: "nonHTTPResponse"
                )
            }
        }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .badURL, .unsupportedURL:
                return GaplessPlaybackFailure(
                    kind: .invalidSource,
                    message: "Invalid audio source",
                    description: urlError.localizedDescription,
                    isRetryable: false,
                    platformCode: urlError.errorCode,
                    platformName: urlError.code.name
                )
            case .notConnectedToInternet, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .networkConnectionLost:
                return GaplessPlaybackFailure(
                    kind: .networkUnavailable,
                    message: "Network unavailable",
                    description: urlError.localizedDescription,
                    isRetryable: true,
                    platformCode: urlError.errorCode,
                    platformName: urlError.code.name
                )
            case .timedOut:
                return GaplessPlaybackFailure(
                    kind: .networkTimeout,
                    message: "Network timeout",
                    description: urlError.localizedDescription,
                    isRetryable: true,
                    platformCode: urlError.errorCode,
                    platformName: urlError.code.name
                )
            case .secureConnectionFailed,
                 .serverCertificateHasBadDate,
                 .serverCertificateUntrusted,
                 .serverCertificateHasUnknownRoot,
                 .serverCertificateNotYetValid,
                 .clientCertificateRejected,
                 .clientCertificateRequired:
                return GaplessPlaybackFailure(
                    kind: .sslFailure,
                    message: "Secure connection failed",
                    description: urlError.localizedDescription,
                    isRetryable: false,
                    platformCode: urlError.errorCode,
                    platformName: urlError.code.name
                )
            case .fileDoesNotExist, .cannotOpenFile:
                return GaplessPlaybackFailure(
                    kind: .sourceNotFound,
                    message: "Audio source not found",
                    description: urlError.localizedDescription,
                    isRetryable: false,
                    platformCode: urlError.errorCode,
                    platformName: urlError.code.name
                )
            default:
                return GaplessPlaybackFailure(
                    kind: .unknown,
                    message: "Unknown playback error",
                    description: urlError.localizedDescription,
                    isRetryable: false,
                    platformCode: urlError.errorCode,
                    platformName: urlError.code.name
                )
            }
        }

        let nsError = error as NSError
        if nsError.domain == NSCocoaErrorDomain {
            switch nsError.code {
            case NSFileNoSuchFileError, NSFileReadNoSuchFileError:
                return GaplessPlaybackFailure(
                    kind: .sourceNotFound,
                    message: "Audio source not found",
                    description: nsError.localizedDescription,
                    isRetryable: false,
                    platformCode: nsError.code,
                    platformName: "NSCocoaErrorDomain"
                )
            case NSFileReadCorruptFileError:
                return GaplessPlaybackFailure(
                    kind: .invalidMedia,
                    message: "Invalid media file",
                    description: nsError.localizedDescription,
                    isRetryable: false,
                    platformCode: nsError.code,
                    platformName: "NSCocoaErrorDomain"
                )
            default:
                break
            }
        }

        return GaplessPlaybackFailure(
            kind: .unknown,
            message: "Unknown playback error",
            description: nsError.localizedDescription,
            isRetryable: false,
            platformCode: nsError.code,
            platformName: nsError.domain
        )
    }
}

private extension URLError.Code {
    var name: String {
        switch self {
        case .badURL: return "badURL"
        case .unsupportedURL: return "unsupportedURL"
        case .cannotFindHost: return "cannotFindHost"
        case .cannotConnectToHost: return "cannotConnectToHost"
        case .networkConnectionLost: return "networkConnectionLost"
        case .dnsLookupFailed: return "dnsLookupFailed"
        case .notConnectedToInternet: return "notConnectedToInternet"
        case .timedOut: return "timedOut"
        case .secureConnectionFailed: return "secureConnectionFailed"
        case .serverCertificateHasBadDate: return "serverCertificateHasBadDate"
        case .serverCertificateUntrusted: return "serverCertificateUntrusted"
        case .serverCertificateHasUnknownRoot: return "serverCertificateHasUnknownRoot"
        case .serverCertificateNotYetValid: return "serverCertificateNotYetValid"
        case .clientCertificateRejected: return "clientCertificateRejected"
        case .clientCertificateRequired: return "clientCertificateRequired"
        case .fileDoesNotExist: return "fileDoesNotExist"
        case .cannotOpenFile: return "cannotOpenFile"
        default: return rawValue.description
        }
    }
}
