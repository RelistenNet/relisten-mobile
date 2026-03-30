import Foundation

/// Read result used by progressive sessions.
///
/// The distinction between `awaitMoreData` and `endOfStream` is central to the design:
/// temporary network starvation must not trigger final padding trim or final-track
/// completion.
enum SourceDataAvailability: Sendable, Equatable {
    case available(Data)
    case awaitMoreData
    case endOfStream
}

/// Result of one ephemeral range read, including any response fingerprint the server exposed.
struct RangeReadResult: Sendable, Equatable {
    var data: Data
    var fingerprint: CacheFingerprint
}

/// Linear byte reader used by the decoder regardless of whether bytes come from a file,
/// the progressive download, or an ephemeral range read.
actor SourceReadSession {
    enum Backend {
        case local(FileHandle)
        case progressive(HTTPSourceSession)
        case ranged(reader: @Sendable (Int64, Int) async throws -> RangeReadResult, contentLength: Int64?)
    }

    private let backend: Backend
    private var offset: Int64

    private init(backend: Backend, startingOffset: Int64) {
        self.backend = backend
        self.offset = startingOffset
    }

    static func local(url: URL, startingOffset: Int64) throws -> SourceReadSession {
        let handle = try FileHandle(forReadingFrom: url)
        try handle.seek(toOffset: UInt64(startingOffset))
        return SourceReadSession(backend: .local(handle), startingOffset: startingOffset)
    }

    static func progressive(session: HTTPSourceSession, startingOffset: Int64) -> SourceReadSession {
        SourceReadSession(backend: .progressive(session), startingOffset: startingOffset)
    }

    static func ranged(
        startingOffset: Int64,
        contentLength: Int64?,
        reader: @escaping @Sendable (Int64, Int) async throws -> RangeReadResult
    ) -> SourceReadSession {
        SourceReadSession(
            backend: .ranged(reader: reader, contentLength: contentLength),
            startingOffset: startingOffset
        )
    }

    deinit {
        if case .local(let handle) = backend {
            try? handle.close()
        }
    }

    func read(maxLength: Int) async throws -> SourceDataAvailability {
        switch backend {
        case .local(let handle):
            let data = try handle.read(upToCount: maxLength) ?? Data()
            offset += Int64(data.count)
            return data.isEmpty ? .endOfStream : .available(data)
        case .progressive(let session):
            let availability = try await session.read(offset: offset, maxLength: maxLength)
            if case .available(let data) = availability {
                offset += Int64(data.count)
            }
            return availability
        case .ranged(let reader, let contentLength):
            if let contentLength, offset >= contentLength {
                return .endOfStream
            }
            let result = try await reader(offset, maxLength)
            offset += Int64(result.data.count)
            return result.data.isEmpty ? .endOfStream : .available(result.data)
        }
    }

    func seek(to offset: Int64) async throws {
        self.offset = offset
        if case .local(let handle) = backend {
            try handle.seek(toOffset: UInt64(offset))
        }
    }
}
