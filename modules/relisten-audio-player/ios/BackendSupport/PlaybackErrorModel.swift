import Foundation

public enum PlaybackErrorKind: String, Sendable {
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

public struct PlaybackStreamError: Sendable {
    public let kind: PlaybackErrorKind
    public let message: String
    public let description: String?
    public let isRetryable: Bool
    public let platform: String
    public let platformCode: Int?
    public let platformName: String?
    public let httpStatus: Int?

    public init(
        kind: PlaybackErrorKind,
        message: String,
        description: String?,
        isRetryable: Bool,
        platform: String,
        platformCode: Int? = nil,
        platformName: String? = nil,
        httpStatus: Int? = nil
    ) {
        self.kind = kind
        self.message = message
        self.description = description
        self.isRetryable = isRetryable
        self.platform = platform
        self.platformCode = platformCode
        self.platformName = platformName
        self.httpStatus = httpStatus
    }

    public var eventPayload: [String: Any?] {
        [
            "kind": kind.rawValue,
            "message": message,
            "description": description,
            "isRetryable": isRetryable,
            "platform": platform,
            "platformCode": platformCode,
            "platformName": platformName,
            "httpStatus": httpStatus,
        ]
    }
}
