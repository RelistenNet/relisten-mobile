import Foundation

enum HTTPTransportError: Error, LocalizedError, Sendable {
    case nonHTTPResponse
    case unexpectedStatus(Int)
    case ignoredRangeRequest(Int)
    case rangeNotSatisfiable

    var errorDescription: String? {
        switch self {
        case .nonHTTPResponse:
            return "Expected HTTP response"
        case .unexpectedStatus(let statusCode):
            return "Unexpected HTTP status \(statusCode)"
        case .ignoredRangeRequest(let statusCode):
            return "Server ignored HTTP range request with status \(statusCode)"
        case .rangeNotSatisfiable:
            return "HTTP range not satisfiable"
        }
    }
}

/// Concrete HTTP transport used in production.
///
/// The design intentionally favors progressive byte-0 downloads with bounded retry
/// rather than a complex segmented cache. That keeps cache promotion atomic and lets
/// local-file and HTTP playback converge on the same read-session model.
struct URLSessionHTTPDataLoader: HTTPDataLoading {
    let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    /// Streams a progressive download, retrying only transport-level failures that are
    /// safe to resume from the highest contiguous byte we have already yielded.
    func progressiveDownload(
        for request: URLRequest,
        retryPolicy: GaplessHTTPRetryPolicy,
        eventHandler: (@Sendable (HTTPTransportLogEvent) -> Void)?
    ) -> AsyncThrowingStream<HTTPDownloadEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var cumulativeBytes: Int64 = 0
                    var attempt = 1

                    while true {
                        try Task.checkCancellation()

                        var attemptRequest = request
                        if cumulativeBytes > 0 {
                            attemptRequest.setValue("bytes=\(cumulativeBytes)-", forHTTPHeaderField: "Range")
                            eventHandler?(
                                HTTPTransportLogEvent(
                                    kind: .resumeAttempt,
                                    method: attemptRequest.httpMethod ?? "GET",
                                    url: attemptRequest.url ?? request.url!,
                                    requestHeaders: attemptRequest.allHTTPHeaderFields ?? [:],
                                    responseHeaders: [:],
                                    statusCode: nil,
                                    attempt: attempt,
                                    chunkBytes: nil,
                                    cumulativeBytes: cumulativeBytes,
                                    retryDelay: nil,
                                    errorDescription: nil
                                )
                            )
                        }

                        eventHandler?(
                            HTTPTransportLogEvent(
                                kind: .requestStarted,
                                method: attemptRequest.httpMethod ?? "GET",
                                url: attemptRequest.url ?? request.url!,
                                requestHeaders: attemptRequest.allHTTPHeaderFields ?? [:],
                                responseHeaders: [:],
                                statusCode: nil,
                                attempt: attempt,
                                chunkBytes: nil,
                                cumulativeBytes: cumulativeBytes,
                                retryDelay: nil,
                                errorDescription: nil
                            )
                        )

                        do {
                            let (bytes, response) = try await session.bytes(for: attemptRequest)
                            let httpResponse = try validateHTTPResponse(response)
                            let requestHasRange = attemptRequest.value(forHTTPHeaderField: "Range") != nil
                            let restartFromZero = try validateProgressiveStatus(httpResponse.statusCode, requestHasRange: requestHasRange)

                            if restartFromZero {
                                cumulativeBytes = 0
                            }

                            eventHandler?(
                                makeTransportEvent(
                                    kind: .responseReceived,
                                    request: attemptRequest,
                                    response: httpResponse,
                                    attempt: attempt,
                                    cumulativeBytes: cumulativeBytes
                                )
                            )
                            continuation.yield(.response(httpResponse, restartFromZero: restartFromZero))

                            var iterator = bytes.makeAsyncIterator()
                            var buffer = Data()
                            buffer.reserveCapacity(SourceReadSizing.progressiveYieldSize)

                            do {
                                while let byte = try await iterator.next() {
                                    buffer.append(byte)
                                    if buffer.count >= SourceReadSizing.progressiveYieldSize {
                                        cumulativeBytes += Int64(buffer.count)
                                        eventHandler?(
                                            HTTPTransportLogEvent(
                                                kind: .bytesReceived,
                                                method: attemptRequest.httpMethod ?? "GET",
                                                url: attemptRequest.url ?? request.url!,
                                                requestHeaders: attemptRequest.allHTTPHeaderFields ?? [:],
                                                responseHeaders: [:],
                                                statusCode: httpResponse.statusCode,
                                                attempt: attempt,
                                                chunkBytes: Int64(buffer.count),
                                                cumulativeBytes: cumulativeBytes,
                                                retryDelay: nil,
                                                errorDescription: nil
                                            )
                                        )
                                        continuation.yield(.bytes(buffer))
                                        buffer.removeAll(keepingCapacity: true)
                                    }
                                }
                            } catch {
                                if !buffer.isEmpty {
                                    cumulativeBytes += Int64(buffer.count)
                                    eventHandler?(
                                        HTTPTransportLogEvent(
                                            kind: .bytesReceived,
                                            method: attemptRequest.httpMethod ?? "GET",
                                            url: attemptRequest.url ?? request.url!,
                                            requestHeaders: attemptRequest.allHTTPHeaderFields ?? [:],
                                            responseHeaders: [:],
                                            statusCode: httpResponse.statusCode,
                                            attempt: attempt,
                                            chunkBytes: Int64(buffer.count),
                                            cumulativeBytes: cumulativeBytes,
                                            retryDelay: nil,
                                            errorDescription: nil
                                        )
                                    )
                                    continuation.yield(.bytes(buffer))
                                    buffer.removeAll(keepingCapacity: true)
                                }
                                throw error
                            }

                            if !buffer.isEmpty {
                                cumulativeBytes += Int64(buffer.count)
                                eventHandler?(
                                    HTTPTransportLogEvent(
                                        kind: .bytesReceived,
                                        method: attemptRequest.httpMethod ?? "GET",
                                        url: attemptRequest.url ?? request.url!,
                                        requestHeaders: attemptRequest.allHTTPHeaderFields ?? [:],
                                        responseHeaders: [:],
                                        statusCode: httpResponse.statusCode,
                                        attempt: attempt,
                                        chunkBytes: Int64(buffer.count),
                                        cumulativeBytes: cumulativeBytes,
                                        retryDelay: nil,
                                        errorDescription: nil
                                    )
                                )
                                continuation.yield(.bytes(buffer))
                            }

                            eventHandler?(
                                HTTPTransportLogEvent(
                                    kind: .requestCompleted,
                                    method: attemptRequest.httpMethod ?? "GET",
                                    url: attemptRequest.url ?? request.url!,
                                    requestHeaders: attemptRequest.allHTTPHeaderFields ?? [:],
                                    responseHeaders: httpResponse.debugHeaderFields,
                                    statusCode: httpResponse.statusCode,
                                    attempt: attempt,
                                    chunkBytes: nil,
                                    cumulativeBytes: cumulativeBytes,
                                    retryDelay: nil,
                                    errorDescription: nil
                                )
                            )
                            continuation.yield(.completed)
                            continuation.finish()
                            return
                        } catch is CancellationError {
                            throw CancellationError()
                        } catch {
                            let decision = retryDecision(for: error)
                            let description = describe(error)
                            let statusCode = decision.statusCode

                            if decision.shouldRetry, attempt < retryPolicy.maxAttempts {
                                let retryDelay = retryDelay(forAttempt: attempt, policy: retryPolicy)
                                eventHandler?(
                                    HTTPTransportLogEvent(
                                        kind: .requestFailed,
                                        method: attemptRequest.httpMethod ?? "GET",
                                        url: attemptRequest.url ?? request.url!,
                                        requestHeaders: attemptRequest.allHTTPHeaderFields ?? [:],
                                        responseHeaders: [:],
                                        statusCode: statusCode,
                                        attempt: attempt,
                                        chunkBytes: nil,
                                        cumulativeBytes: cumulativeBytes,
                                        retryDelay: nil,
                                        errorDescription: description
                                    )
                                )
                                eventHandler?(
                                    HTTPTransportLogEvent(
                                        kind: .retryScheduled,
                                        method: attemptRequest.httpMethod ?? "GET",
                                        url: attemptRequest.url ?? request.url!,
                                        requestHeaders: attemptRequest.allHTTPHeaderFields ?? [:],
                                        responseHeaders: [:],
                                        statusCode: statusCode,
                                        attempt: attempt,
                                        chunkBytes: nil,
                                        cumulativeBytes: cumulativeBytes,
                                        retryDelay: retryDelay,
                                        errorDescription: description
                                    )
                                )
                                try await Task.sleep(for: .seconds(retryDelay))
                                attempt += 1
                                continue
                            }

                            eventHandler?(
                                HTTPTransportLogEvent(
                                    kind: .requestFailed,
                                    method: attemptRequest.httpMethod ?? "GET",
                                    url: attemptRequest.url ?? request.url!,
                                    requestHeaders: attemptRequest.allHTTPHeaderFields ?? [:],
                                    responseHeaders: [:],
                                    statusCode: statusCode,
                                    attempt: attempt,
                                    chunkBytes: nil,
                                    cumulativeBytes: cumulativeBytes,
                                    retryDelay: nil,
                                    errorDescription: description
                                )
                            )
                            throw error
                        }
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    /// Performs a one-shot range request, primarily for seeks that land beyond the
    /// currently downloaded progressive prefix.
    func rangeRequest(
        for request: URLRequest,
        retryPolicy: GaplessHTTPRetryPolicy,
        eventHandler: (@Sendable (HTTPTransportLogEvent) -> Void)?
    ) async throws -> RangeReadResult {
        var attempt = 1

        while true {
            try Task.checkCancellation()

            eventHandler?(
                HTTPTransportLogEvent(
                    kind: .requestStarted,
                    method: request.httpMethod ?? "GET",
                    url: request.url!,
                    requestHeaders: request.allHTTPHeaderFields ?? [:],
                    responseHeaders: [:],
                    statusCode: nil,
                    attempt: attempt,
                    chunkBytes: nil,
                    cumulativeBytes: nil,
                    retryDelay: nil,
                    errorDescription: nil
                )
            )

            do {
                let (data, response) = try await session.data(for: request)
                let httpResponse = try validateHTTPResponse(response)
                eventHandler?(makeTransportEvent(kind: .responseReceived, request: request, response: httpResponse, attempt: attempt, cumulativeBytes: Int64(data.count)))
                try validateRangeStatus(httpResponse.statusCode, request: request)

                eventHandler?(
                    HTTPTransportLogEvent(
                        kind: .bytesReceived,
                        method: request.httpMethod ?? "GET",
                        url: request.url!,
                        requestHeaders: request.allHTTPHeaderFields ?? [:],
                        responseHeaders: [:],
                        statusCode: httpResponse.statusCode,
                        attempt: attempt,
                        chunkBytes: Int64(data.count),
                        cumulativeBytes: Int64(data.count),
                        retryDelay: nil,
                        errorDescription: nil
                    )
                )
                eventHandler?(
                    HTTPTransportLogEvent(
                        kind: .requestCompleted,
                        method: request.httpMethod ?? "GET",
                        url: request.url!,
                        requestHeaders: request.allHTTPHeaderFields ?? [:],
                        responseHeaders: httpResponse.debugHeaderFields,
                        statusCode: httpResponse.statusCode,
                        attempt: attempt,
                        chunkBytes: nil,
                        cumulativeBytes: Int64(data.count),
                        retryDelay: nil,
                        errorDescription: nil
                    )
                )
                return RangeReadResult(data: data, fingerprint: Self.fingerprint(from: httpResponse))
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                let decision = retryDecision(for: error)
                let description = describe(error)

                if decision.shouldRetry, attempt < retryPolicy.maxAttempts {
                    let delay = retryDelay(forAttempt: attempt, policy: retryPolicy)
                    eventHandler?(
                        HTTPTransportLogEvent(
                            kind: .requestFailed,
                            method: request.httpMethod ?? "GET",
                            url: request.url!,
                            requestHeaders: request.allHTTPHeaderFields ?? [:],
                            responseHeaders: [:],
                            statusCode: decision.statusCode,
                            attempt: attempt,
                            chunkBytes: nil,
                            cumulativeBytes: nil,
                            retryDelay: nil,
                            errorDescription: description
                        )
                    )
                    eventHandler?(
                        HTTPTransportLogEvent(
                            kind: .retryScheduled,
                            method: request.httpMethod ?? "GET",
                            url: request.url!,
                            requestHeaders: request.allHTTPHeaderFields ?? [:],
                            responseHeaders: [:],
                            statusCode: decision.statusCode,
                            attempt: attempt,
                            chunkBytes: nil,
                            cumulativeBytes: nil,
                            retryDelay: delay,
                            errorDescription: description
                        )
                    )
                    try await Task.sleep(for: .seconds(delay))
                    attempt += 1
                    continue
                }

                eventHandler?(
                    HTTPTransportLogEvent(
                        kind: .requestFailed,
                        method: request.httpMethod ?? "GET",
                        url: request.url!,
                        requestHeaders: request.allHTTPHeaderFields ?? [:],
                        responseHeaders: [:],
                        statusCode: decision.statusCode,
                        attempt: attempt,
                        chunkBytes: nil,
                        cumulativeBytes: nil,
                        retryDelay: nil,
                        errorDescription: description
                    )
                )
                throw error
            }
        }
    }

    private func validateHTTPResponse(_ response: URLResponse) throws -> HTTPURLResponse {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw HTTPTransportError.nonHTTPResponse
        }
        return httpResponse
    }

    private func validateProgressiveStatus(_ statusCode: Int, requestHasRange: Bool) throws -> Bool {
        if requestHasRange {
            if statusCode == 206 {
                return false
            }
            if statusCode == 200 {
                return true
            }
        } else if statusCode == 200 {
            return false
        }
        throw HTTPTransportError.unexpectedStatus(statusCode)
    }

    private func validateRangeStatus(_ statusCode: Int, request: URLRequest) throws {
        guard request.value(forHTTPHeaderField: "Range") != nil else {
            guard (200 ..< 300).contains(statusCode) else {
                throw HTTPTransportError.unexpectedStatus(statusCode)
            }
            return
        }

        if statusCode == 206 {
            return
        }
        if statusCode == 416 {
            throw HTTPTransportError.rangeNotSatisfiable
        }
        if statusCode == 200 {
            throw HTTPTransportError.ignoredRangeRequest(statusCode)
        }
        throw HTTPTransportError.unexpectedStatus(statusCode)
    }

    private func makeTransportEvent(
        kind: GaplessHTTPLogEventKind,
        request: URLRequest,
        response: HTTPURLResponse,
        attempt: Int,
        cumulativeBytes: Int64?
    ) -> HTTPTransportLogEvent {
        HTTPTransportLogEvent(
            kind: kind,
            method: request.httpMethod ?? "GET",
            url: request.url!,
            requestHeaders: request.allHTTPHeaderFields ?? [:],
            responseHeaders: response.debugHeaderFields,
            statusCode: response.statusCode,
            attempt: attempt,
            chunkBytes: nil,
            cumulativeBytes: cumulativeBytes,
            retryDelay: nil,
            errorDescription: nil
        )
    }

    static func fingerprint(from response: HTTPURLResponse) -> CacheFingerprint {
        let contentLength = response.contentLengthFromHeaders
        return CacheFingerprint(
            contentLength: contentLength,
            etag: response.value(forHTTPHeaderField: "ETag"),
            lastModified: response.value(forHTTPHeaderField: "Last-Modified")
        )
    }

    private func retryDecision(for error: Error) -> (shouldRetry: Bool, statusCode: Int?) {
        if error is CancellationError {
            return (false, nil)
        }
        if let transportError = error as? HTTPTransportError {
            switch transportError {
            case .unexpectedStatus(let statusCode):
                return (statusCode == 408 || statusCode == 429 || (500 ... 599).contains(statusCode), statusCode)
            case .rangeNotSatisfiable:
                return (false, 416)
            case .ignoredRangeRequest:
                return (false, 200)
            case .nonHTTPResponse:
                return (false, nil)
            }
        }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut, .networkConnectionLost, .notConnectedToInternet, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed:
                return (true, nil)
            case .cancelled:
                return (false, nil)
            default:
                return (false, nil)
            }
        }
        return (false, nil)
    }

    private func retryDelay(forAttempt attempt: Int, policy: GaplessHTTPRetryPolicy) -> TimeInterval {
        let exponent = max(0, attempt - 1)
        let delay = min(policy.initialBackoff * pow(policy.multiplier, Double(exponent)), policy.maxBackoff)
        guard policy.usesJitter else {
            return delay
        }
        return max(0, delay * Double.random(in: 0.8 ... 1.2))
    }

    private func describe(_ error: Error) -> String {
        if let localized = error as? LocalizedError, let description = localized.errorDescription {
            return description
        }
        return String(describing: error)
    }
}

extension HTTPURLResponse {
    var debugHeaderFields: [String: String] {
        var headers: [String: String] = [:]
        allHeaderFields.forEach { key, value in
            headers[String(describing: key)] = String(describing: value)
        }
        return headers
    }

    var contentLengthFromHeaders: Int64? {
        guard let contentRange = value(forHTTPHeaderField: "Content-Range"),
              let totalRangeComponent = contentRange.split(separator: "/").last,
              totalRangeComponent != "*" else {
            return value(forHTTPHeaderField: "Content-Length").flatMap(Int64.init)
        }
        return Int64(totalRangeComponent)
    }
}
