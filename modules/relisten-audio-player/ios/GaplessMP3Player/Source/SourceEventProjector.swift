import Foundation

/// Single mapping point from low-level transport signals into public status/log shapes.
struct SourceEventProjector {
    let retryPolicy: GaplessHTTPRetryPolicy

    func httpLogEvent(
        source: GaplessPlaybackSource,
        requestKind: GaplessHTTPRequestKind,
        transportEvent: HTTPTransportLogEvent
    ) -> GaplessHTTPLogEvent {
        GaplessHTTPLogEvent(
            kind: transportEvent.kind,
            requestKind: requestKind,
            sourceID: source.id,
            cacheKey: source.cacheKey,
            method: transportEvent.method,
            url: transportEvent.url,
            requestHeaders: transportEvent.requestHeaders,
            responseHeaders: transportEvent.responseHeaders,
            statusCode: transportEvent.statusCode,
            attempt: transportEvent.attempt,
            maxAttempts: retryPolicy.maxAttempts,
            chunkBytes: transportEvent.chunkBytes,
            cumulativeBytes: transportEvent.cumulativeBytes,
            retryDelay: transportEvent.retryDelay,
            errorDescription: transportEvent.errorDescription
        )
    }

    func downloadingStatus(
        source: GaplessPlaybackSource,
        downloadedBytes: Int64,
        expectedBytes: Int64?,
        state: SourceDownloadState = .downloading,
        resolvedFileURL: URL? = nil
    ) -> SourceDownloadStatus {
        SourceDownloadStatus(
            source: source,
            state: state,
            downloadedBytes: downloadedBytes,
            expectedBytes: expectedBytes,
            resolvedFileURL: resolvedFileURL
        )
    }

    func retryingStatus(
        source: GaplessPlaybackSource,
        downloadedBytes: Int64,
        expectedBytes: Int64?,
        errorDescription: String?,
        retryAttempt: Int,
        retryDelay: TimeInterval?,
        resolvedFileURL: URL? = nil
    ) -> SourceDownloadStatus {
        SourceDownloadStatus(
            source: source,
            state: .retrying,
            downloadedBytes: downloadedBytes,
            expectedBytes: expectedBytes,
            resolvedFileURL: resolvedFileURL,
            errorDescription: errorDescription,
            retryAttempt: retryAttempt,
            maxRetryAttempts: retryPolicy.maxAttempts,
            retryDelay: retryDelay
        )
    }

    func failedStatus(
        source: GaplessPlaybackSource,
        downloadedBytes: Int64,
        expectedBytes: Int64?,
        errorDescription: String?,
        resolvedFileURL: URL? = nil
    ) -> SourceDownloadStatus {
        SourceDownloadStatus(
            source: source,
            state: .failed,
            downloadedBytes: downloadedBytes,
            expectedBytes: expectedBytes,
            resolvedFileURL: resolvedFileURL,
            errorDescription: errorDescription
        )
    }

    func retryMessage(sourceID: String, retryAttempt: Int, errorDescription: String?) -> String {
        "\(sourceID) retry \(retryAttempt)/\(retryPolicy.maxAttempts): \(errorDescription ?? "unknown error")"
    }
}
