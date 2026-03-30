import Foundation

/// Caller-provided description of one MP3 input.
///
/// `cacheKey` is the stable identity used for durable cache entries, so callers should
/// keep it stable across equivalent URLs/headers.
public struct GaplessPlaybackSource: Codable, Equatable, Sendable {
    public var id: String
    public var url: URL
    public var cacheKey: String
    public var headers: [String: String]
    public var expectedContentLength: Int64?

    public init(
        id: String,
        url: URL,
        cacheKey: String,
        headers: [String: String] = [:],
        expectedContentLength: Int64? = nil
    ) {
        self.id = id
        self.url = url
        self.cacheKey = cacheKey
        self.headers = headers
        self.expectedContentLength = expectedContentLength
    }
}

/// Controls whether completed byte-0 downloads are promoted into the durable cache.
public enum GaplessCacheMode: String, Codable, Equatable, Sendable {
    case enabled
    case disabled
}

/// Retry/backoff settings shared by progressive downloads and range requests.
public struct GaplessHTTPRetryPolicy: Codable, Equatable, Sendable {
    public var maxAttempts: Int
    public var initialBackoff: TimeInterval
    public var multiplier: Double
    public var maxBackoff: TimeInterval
    public var usesJitter: Bool

    public init(
        maxAttempts: Int = 3,
        initialBackoff: TimeInterval = 0.25,
        multiplier: Double = 2.0,
        maxBackoff: TimeInterval = 2.0,
        usesJitter: Bool = true
    ) {
        self.maxAttempts = max(1, maxAttempts)
        self.initialBackoff = max(0, initialBackoff)
        self.multiplier = max(1, multiplier)
        self.maxBackoff = max(0, maxBackoff)
        self.usesJitter = usesJitter
    }
}
