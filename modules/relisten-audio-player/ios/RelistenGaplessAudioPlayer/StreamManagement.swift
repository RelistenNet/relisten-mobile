//
//  StreamManagement.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation

var allStreamCachers: [RelistenStreamCacher] = []

extension RelistenGaplessAudioPlayer {
    func buildStream(_ streamIntent: RelistenStreamIntent, fileOffset: DWORD = 0, channelOffset: QWORD = 0, attempts: Int = 2) -> RelistenGaplessAudioStream? {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        maybeSetupBASS()

        var newStream: HSTREAM = 0
        var streamCacher: RelistenStreamCacher?
        let streamable = streamIntent.streamable
        
        if streamable.url.isFileURL {
            NSLog("[relisten-audio-player][bass][stream] buildStream: calling BASS_StreamCreateFile for \(streamable.identifier)")
            newStream = BASS_StreamCreateFile(0,
                                              streamable.url.path.cString(using: .utf8),
                                              UInt64(fileOffset),
                                              0,
                                              DWORD(BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT | BASS_ASYNCFILE | BASS_STREAM_PRESCAN))
        } else {
            let newStreamCacher = RelistenStreamCacher(self, streamable: streamable)
            allStreamCachers.append(newStreamCacher)
            NSLog("[relisten-audio-player] Added StreamCacher for \(newStreamCacher.streamable.identifier); \(allStreamCachers.count) total")
            
            streamCacher = newStreamCacher

            NSLog("[relisten-audio-player][bass][stream] buildStream: calling BASS_StreamCreateURL for \(streamable.identifier) with fileOffset=\(fileOffset)")

            if fileOffset == 0 {
                newStream = BASS_StreamCreateURL(streamable.url.absoluteString.cString(using: .utf8),
                                                 fileOffset,
                                                 DWORD(BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT),
                                                 streamDownloadProc,
                                                 Unmanaged.passUnretained(streamCacher!).toOpaque())
            } else {
                newStream = BASS_StreamCreateURL(streamable.url.absoluteString.cString(using: .utf8),
                                                 fileOffset,
                                                 DWORD(BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT),
                                                 nil,
                                                 nil)

            }
        }
        
        NSLog("[relisten-audio-player][bass][stream] buildStream: calling BASS_StreamCreate* complete for \(streamable.identifier)")


        // oops
        if newStream == 0 {
            let code = BASS_ErrorGetCode()
            
            if (code == BASS_ERROR_UNKNOWN) {
                NSLog("[relisten-audio-player][bass][stream] buildStream: error creating new stream, ignoring because it probably means setNextStream was called identifier=\(streamable.identifier): \(code)")
                return nil
            }
            
            var err = ErrorForErrorCode(code)
            
            if (code == BASS_ERROR_TIMEOUT) {
                err = NSError(domain: "net.relisten.ios.relisten-audio-player", code: err.code, userInfo: [NSLocalizedDescriptionKey: "Server timeout: Check your Internet connection or maybe \(streamable.url.host ?? streamable.url.absoluteString) is having issues"])
            } else if (code == BASS_ERROR_FILEFORM) {
                err = NSError(domain: "net.relisten.ios.relisten-audio-player", code: err.code, userInfo: [NSLocalizedDescriptionKey: "Non-audio content: \(streamable.url.host ?? streamable.url.absoluteString) did not provide audio, maybe there are server issues"])
            }

            NSLog("[relisten-audio-player][bass][stream] buildStream: error creating new stream identifier=\(streamable.identifier): %d %@", err.code, err.localizedDescription)

            DispatchQueue.main.async {
                self.delegate?.errorStartingStream(self, error: err, forStreamable: streamable)
            }

            return nil
        }

        bass_assert(BASS_ChannelSetSync(newStream,
                                        DWORD(BASS_SYNC_MIXTIME | BASS_SYNC_DOWNLOAD),
                                        0,
                                        streamDownloadCompleteSyncProc,
                                        Unmanaged.passUnretained(self).toOpaque()))

        bass_assert(BASS_ChannelSetSync(newStream,
                                        DWORD(BASS_SYNC_MIXTIME | BASS_SYNC_STALL),
                                        0,
                                        streamStallSyncProc,
                                        Unmanaged.passUnretained(self).toOpaque()))

        NSLog("[relisten-audio-player][bass][stream] created new stream: %u. identifier=%@", newStream, streamable.identifier)

        let stream = RelistenGaplessAudioStream(
            streamCacher: streamCacher,
            stream: newStream,
            fileOffset: fileOffset,
            channelOffset: channelOffset
        )
        
        streamIntent.audioStream = stream
        
        fetchAlbumArt(streamIntent: streamIntent)
        
        return stream
    }

    func startPreloadingNextStream() {
        // don't start loading anything until the active stream has finished
        guard let nextStreamIntent, activeStream?.preloadFinished == true else {
            return
        }

        NSLog("[relisten-audio-player][bass][preloadNextTrack] Preloading next track \(nextStreamIntent.streamable.identifier)")
        
        nextStream = buildStream(nextStreamIntent)

        if let nextStream {
            BASS_ChannelUpdate(nextStream.stream, 0)
            nextStream.preloadStarted = true
        }
    }
}

internal var streamDownloadProc: @convention(c) (_ buffer: UnsafeRawPointer?,
                                                 _ length: DWORD,
                                                 _ user: UnsafeMutableRawPointer?) -> Void = {
                                                    buffer, length, user in
                                                    if let streamCacherPtr = user {
                                                        let streamCacher: RelistenStreamCacher = Unmanaged.fromOpaque(streamCacherPtr).takeUnretainedValue()

                                                        if let safeBuffer = buffer, length > 0 {
                                                            let data = Data(bytes: safeBuffer, count: Int(length))
                                                            streamCacher.writeData(data)
                                                        } else {
                                                            streamCacher.finishWritingData()
                                                            
                                                            // Remove the extra reference that prevented crashes when the streamIntents get cleaned up
                                                            for (idx, cacher) in allStreamCachers.enumerated() {
                                                                if cacher.streamable.identifier == streamCacher.streamable.identifier {
                                                                    NSLog("[relisten-audio-player] Removing StreamCacher for \(streamCacher.streamable.identifier) at idx=\(idx); \(allStreamCachers.count - 1) remaining")
                                                                    allStreamCachers.remove(at: idx)
                                                                    break
                                                                }
                                                            }
                                                        }
                                                    }
                                                 }
