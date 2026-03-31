import Foundation

/// Resolved local representation of a source after cache lookup or download completion.
struct ResolvedSource: Sendable {
    var localFileURL: URL
    var fingerprint: CacheFingerprint
    var isCached: Bool
}

/// Durable cache index entry for one fully completed byte-0 download.
struct CachedSourceRecord: Codable, Sendable {
    var sourceURL: URL
    var fileName: String
    var fingerprint: CacheFingerprint
    var validatedByteLength: Int64
    var completedAt: Date
}

/// File-system locations used by one in-flight progressive download.
struct SourceDownloadPaths: Sendable {
    var tempFileURL: URL
    var finalFileURL: URL
    var indexURL: URL
}

/// File-system boundary for durable cache lookup and atomic promotion.
struct SourceCacheStore: @unchecked Sendable {
    let cacheDirectory: URL
    let indexDirectory: URL
    let tempDirectory: URL
    let fileManager: FileManager

    init(cacheDirectory: URL, fileManager: FileManager) {
        self.cacheDirectory = cacheDirectory
        self.indexDirectory = cacheDirectory.appendingPathComponent("index", isDirectory: true)
        self.tempDirectory = cacheDirectory.appendingPathComponent("temp", isDirectory: true)
        self.fileManager = fileManager
    }

    func ensureDirectories() throws {
        try fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: indexDirectory, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    }

    func scavengeTempFiles() {
        guard let contents = try? fileManager.contentsOfDirectory(at: tempDirectory, includingPropertiesForKeys: nil) else {
            return
        }
        for file in contents {
            try? fileManager.removeItem(at: file)
        }
    }

    func makeDownloadPaths(for source: GaplessPlaybackSource) throws -> SourceDownloadPaths {
        try ensureDirectories()
        let finalFileURL = cacheDirectory.appendingPathComponent("\(source.cacheKey).mp3")
        let tempFileURL = tempDirectory.appendingPathComponent("\(source.cacheKey)-\(UUID().uuidString).download")
        fileManager.createFile(atPath: tempFileURL.path, contents: nil)
        return SourceDownloadPaths(
            tempFileURL: tempFileURL,
            finalFileURL: finalFileURL,
            indexURL: indexDirectory.appendingPathComponent("\(source.cacheKey).json")
        )
    }

    func resolvedCachedSource(for source: GaplessPlaybackSource) throws -> ResolvedSource? {
        guard let record = try cachedRecord(for: source), try isValidCacheRecord(record, source: source) else {
            return nil
        }
        return ResolvedSource(
            localFileURL: cacheDirectory.appendingPathComponent(record.fileName),
            fingerprint: record.fingerprint,
            isCached: true
        )
    }

    func cachedRecord(for source: GaplessPlaybackSource) throws -> CachedSourceRecord? {
        let url = indexDirectory.appendingPathComponent("\(source.cacheKey).json")
        guard fileManager.fileExists(atPath: url.path) else {
            return nil
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(CachedSourceRecord.self, from: data)
    }

    func isValidCacheRecord(_ record: CachedSourceRecord, source: GaplessPlaybackSource) throws -> Bool {
        let fileURL = cacheDirectory.appendingPathComponent(record.fileName)
        guard fileManager.fileExists(atPath: fileURL.path) else {
            return false
        }
        let attributes = try fileManager.attributesOfItem(atPath: fileURL.path)
        let fileSize = attributes[.size] as? NSNumber
        if let expected = source.expectedContentLength ?? record.fingerprint.contentLength,
           Int64(fileSize?.int64Value ?? -1) != expected {
            return false
        }
        return true
    }

    func fingerprintForLocalFile(url: URL) -> CacheFingerprint {
        let contentLength = (try? fileManager.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value
        return CacheFingerprint(contentLength: contentLength, etag: nil, lastModified: nil)
    }

    func persistCompletedDownload(
        for source: GaplessPlaybackSource,
        paths: SourceDownloadPaths,
        fingerprint: CacheFingerprint,
        validatedByteLength: Int64,
        cacheMode: GaplessCacheMode
    ) throws -> ResolvedSource {
        if cacheMode == .enabled {
            if fileManager.fileExists(atPath: paths.finalFileURL.path) {
                try fileManager.removeItem(at: paths.finalFileURL)
            }
            try fileManager.moveItem(at: paths.tempFileURL, to: paths.finalFileURL)
            let record = CachedSourceRecord(
                sourceURL: source.url,
                fileName: paths.finalFileURL.lastPathComponent,
                fingerprint: fingerprint,
                validatedByteLength: validatedByteLength,
                completedAt: Date()
            )
            let encoded = try JSONEncoder().encode(record)
            try encoded.write(to: paths.indexURL, options: .atomic)
            return ResolvedSource(localFileURL: paths.finalFileURL, fingerprint: fingerprint, isCached: true)
        }

        return ResolvedSource(localFileURL: paths.tempFileURL, fingerprint: fingerprint, isCached: false)
    }
}
