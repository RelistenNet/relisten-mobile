//
//  StreamingCache.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 12/21/23.
//

import Foundation

public class RelistenStreamCacher {
    let streamable: RelistenGaplessStreamable
    weak var player: RelistenGaplessAudioPlayer?

    var complete = false
    var failedToCreateFile = false

    var file: FileHandle?
    var bytesWritten = 0
    var bytesSeen = 0

    var lastBytesLogged = 0

    public init(_ player: RelistenGaplessAudioPlayer, streamable: RelistenGaplessStreamable) {
        self.player = player
        self.streamable = streamable
    }

    func teardown() {
        if !complete {
            deleteFile()
        }
    }

    func writeData(_ data: Data) {
        assert(!self.complete)

        do {
            try writeDataUnsafe(data)
        } catch {
            NSLog("[bass][stream caching] Failed to write data file=\(String(describing: file)) for streamable=\(streamable). Error=\(error)")
        }
    }
    
    private func sendProgressUpdate(bytes: Int?) {
        if (player != nil) {
            if let activeStream = player?.activeStream {
                let isActiveTrack = activeStream.streamable.identifier == streamable.identifier;

                let totalFileBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_SIZE))
                
                let downloadedBytes = if let bytes { UInt64(bytes) } else { totalFileBytes }

                player?.delegate?.downloadProgressChanged(player!, forActiveTrack: isActiveTrack, downloadedBytes: downloadedBytes, totalBytes: totalFileBytes)
            }
        }
    }

    private func writeDataUnsafe(_ data: Data) throws {
        bytesSeen += data.count
        
        guard let downloadDestination = streamable.downloadDestination else {
            self.sendProgressUpdate(bytes: bytesSeen)
            
            return
        }

        if failedToCreateFile {
            return
        }

        if file == nil {
            do {
                if !FileManager.default.fileExists(atPath: downloadDestination.absoluteString) {
                    // you must create the file before opening a file handle
                    try FileManager.default.createDirectory(at: downloadDestination.deletingLastPathComponent(), withIntermediateDirectories: true)

                    // write initial data
                    try data.write(to: downloadDestination)
                    bytesWritten += data.count

                    file = try FileHandle(forWritingTo: downloadDestination)
                } else {
                    NSLog("[bass][stream caching] File already exists for streamable=\(streamable.identifier)")
                }
            } catch CocoaError.fileWriteFileExists, CocoaError.fileLocking {
                // if the file already exists or is already opened for writing, don't do anything.
                // this probably means the same track is the activeStream and the nextStream
                failedToCreateFile = true
                NSLog("[bass][stream caching] Failed to open file handle for streamable=\(streamable.identifier)")
            }
        } else if let file = file {
            file.write(data)
            bytesWritten += data.count
        }

        if (bytesWritten - lastBytesLogged) >= 1_000_000 {
            NSLog("[bass][stream caching] Written \(bytesWritten) bytes for streamable=\(streamable.identifier).")
            lastBytesLogged = bytesWritten

            // send download progress updates for streaming cache
            self.sendProgressUpdate(bytes: bytesWritten)
        }
    }

    func finishWritingData() {
        if let file = file {
            do {
                try file.close()
                self.file = nil
                complete = true

                // emit event
                player?.delegate?.streamingCacheCompleted(forStreamable: streamable, bytesWritten: bytesWritten)
                self.sendProgressUpdate(bytes: nil)
            } catch {
                NSLog("[bass][stream caching] Failed to close file=\(file) for streamable=\(streamable.identifier). Error=\(error)")
            }
        }
    }

    func deleteFile() {
        if let downloadDestination = streamable.downloadDestination {
            finishWritingData()
            do {
                try FileManager.default.removeItem(at: downloadDestination)
            } catch {
                NSLog("[bass][stream caching] Failed remove file at downloadDestination=\(downloadDestination). Error=\(error)")
            }
        }
    }
}
