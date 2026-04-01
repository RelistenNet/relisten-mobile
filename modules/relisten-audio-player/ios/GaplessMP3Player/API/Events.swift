import Foundation

/// Distinguishes metadata probes from long-lived progressive downloads and far-seek range reads.
public enum GaplessHTTPRequestKind: String, Codable, Sendable {
    case metadata
    case progressive
    case range
}

/// Structured lifecycle event emitted by the HTTP transport layer.
public enum GaplessHTTPLogEventKind: String, Codable, Sendable {
    case requestStarted
    case requestPromoted
    case responseReceived
    case bytesReceived
    case requestCompleted
    case retryScheduled
    case requestFailed
    case resumeAttempt
}

/// Structured HTTP event surfaced to callers for observability and debugging.
public struct GaplessHTTPLogEvent: Sendable {
    public var kind: GaplessHTTPLogEventKind
    public var requestKind: GaplessHTTPRequestKind
    public var previousRequestKind: GaplessHTTPRequestKind?
    public var sessionID: String?
    public var sourceID: String
    public var cacheKey: String
    public var method: String
    public var url: URL
    public var requestHeaders: [String: String]
    public var responseHeaders: [String: String]
    public var statusCode: Int?
    public var attempt: Int
    public var maxAttempts: Int
    public var chunkBytes: Int64?
    public var cumulativeBytes: Int64?
    public var retryDelay: TimeInterval?
    public var errorDescription: String?

    public init(
        kind: GaplessHTTPLogEventKind,
        requestKind: GaplessHTTPRequestKind,
        previousRequestKind: GaplessHTTPRequestKind? = nil,
        sessionID: String? = nil,
        sourceID: String,
        cacheKey: String,
        method: String = "GET",
        url: URL,
        requestHeaders: [String: String] = [:],
        responseHeaders: [String: String] = [:],
        statusCode: Int? = nil,
        attempt: Int,
        maxAttempts: Int,
        chunkBytes: Int64? = nil,
        cumulativeBytes: Int64? = nil,
        retryDelay: TimeInterval? = nil,
        errorDescription: String? = nil
    ) {
        self.kind = kind
        self.requestKind = requestKind
        self.previousRequestKind = previousRequestKind
        self.sessionID = sessionID
        self.sourceID = sourceID
        self.cacheKey = cacheKey
        self.method = method
        self.url = url
        self.requestHeaders = requestHeaders
        self.responseHeaders = responseHeaders
        self.statusCode = statusCode
        self.attempt = attempt
        self.maxAttempts = maxAttempts
        self.chunkBytes = chunkBytes
        self.cumulativeBytes = cumulativeBytes
        self.retryDelay = retryDelay
        self.errorDescription = errorDescription
    }
}

/// Runtime events emitted after playback has started.
public enum GaplessRuntimeEvent: Sendable {
    case playbackFailed(GaplessPlaybackFailure, sessionID: String? = nil)
    case networkRetrying(String, sessionID: String? = nil)
    case trackTransitioned(
        previous: GaplessPlaybackSource?,
        current: GaplessPlaybackSource?,
        sessionID: String? = nil
    )
    case playbackFinished(last: GaplessPlaybackSource?, sessionID: String? = nil)
}

extension GaplessRuntimeEvent {
    var sessionID: String? {
        switch self {
        case .playbackFailed(_, let sessionID),
             .networkRetrying(_, let sessionID),
             .trackTransitioned(_, _, let sessionID),
             .playbackFinished(_, let sessionID):
            return sessionID
        }
    }

    func withSessionID(_ sessionID: String?) -> Self {
        switch self {
        case .playbackFailed(let failure, _):
            return .playbackFailed(failure, sessionID: sessionID)
        case .networkRetrying(let description, _):
            return .networkRetrying(description, sessionID: sessionID)
        case .trackTransitioned(let previous, let current, _):
            return .trackTransitioned(previous: previous, current: current, sessionID: sessionID)
        case .playbackFinished(let last, _):
            return .playbackFinished(last: last, sessionID: sessionID)
        }
    }
}

/// Preparation-phase events emitted while metadata/loading work is in flight.
public enum GaplessPreparationEvent: Sendable {
    case phase(String)
    case download(SourceDownloadStatus)
    case prepared(GaplessPreparationReport)
}
