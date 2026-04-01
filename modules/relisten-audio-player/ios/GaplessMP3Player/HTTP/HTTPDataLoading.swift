import Foundation

/// Transport-level event emitted before projection into public logging/status models.
struct HTTPTransportLogEvent: Sendable {
    var kind: GaplessHTTPLogEventKind
    var method: String
    var url: URL
    var requestHeaders: [String: String]
    var responseHeaders: [String: String]
    var statusCode: Int?
    var attempt: Int
    var chunkBytes: Int64?
    var cumulativeBytes: Int64?
    var retryDelay: TimeInterval?
    var errorDescription: String?
}

/// Minimal HTTP abstraction used by the source manager for progressive and ranged reads.
protocol HTTPDataLoading: Sendable {
    func progressiveDownload(
        for request: URLRequest,
        retryPolicy: GaplessHTTPRetryPolicy,
        eventHandler: (@Sendable (HTTPTransportLogEvent) -> Void)?
    ) -> AsyncThrowingStream<HTTPDownloadEvent, Error>

    func rangeRequest(
        for request: URLRequest,
        retryPolicy: GaplessHTTPRetryPolicy,
        eventHandler: (@Sendable (HTTPTransportLogEvent) -> Void)?
    ) async throws -> RangeReadResult
}

/// Progressive byte-stream events consumed by `HTTPSourceSession`.
enum HTTPDownloadEvent: Sendable {
    case response(HTTPURLResponse, restartFromZero: Bool)
    case bytes(Data)
    case completed
}
