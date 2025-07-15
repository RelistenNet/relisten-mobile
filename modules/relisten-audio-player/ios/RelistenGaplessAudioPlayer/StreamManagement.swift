//
//  StreamManagement.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation

/// A class to provide threadsafe access to the underlying array of StreamCachers
class StreamCacherRegistry {
    public static let sharedInstance = StreamCacherRegistry()
    
    internal let queue = DispatchQueue(label: "net.relisten.ios.stream-cacher-registry")
    internal var allStreamCachers: [RelistenStreamCacher] = []
    
    func register(_ newStreamCacher: RelistenStreamCacher) {
        queue.sync {
            NSLog("[relisten-audio-player] Adding StreamCacher for \(newStreamCacher.streamable.identifier); \(allStreamCachers.count) existing")
            allStreamCachers.append(newStreamCacher)
        }
    }
    
    func discard(_ streamCacher: RelistenStreamCacher) {
        queue.sync {
            if let idx = allStreamCachers.firstIndex(where: { $0.streamable.identifier == streamCacher.streamable.identifier }) {
                NSLog("[relisten-audio-player] Removing StreamCacher for \(streamCacher.streamable.identifier) at idx=\(idx); \(allStreamCachers.count - 1) remaining")
                allStreamCachers.remove(at: idx)
            }
        }
    }
}

extension RelistenGaplessAudioPlayer {
    /// completion is always called on bassQueue
    func buildStream(_ streamIntent: RelistenStreamIntent,
                     fileOffset: DWORD = 0,
                     channelOffset: QWORD = 0,
                     attempts: Int = 3,
                     completion: @escaping (RelistenGaplessAudioStream?) -> Void,
                     isRetry: Bool = false) {
        assert(isSetup)

        let streamable = streamIntent.streamable
        
        if (!isRetry) {
            dispatchPrecondition(condition: .onQueue(bassQueue))
            numberOfStreamsFetching += 1
        }

        networkQueue.async { [weak self] in
            guard let self else { return }

            var newStream: HSTREAM = 0
            var streamCacher: RelistenStreamCacher?
            
            let timingStart = DispatchTime.now()
            
            if streamable.url.isFileURL {
                NSLog("[relisten-audio-player][bass][stream][] buildStream: calling BASS_StreamCreateFile for \(streamable.identifier) numberOfStreamsFetching=\(numberOfStreamsFetching)")
                newStream = BASS_StreamCreateFile(0,
                                                  streamable.url.path.cString(using: .utf8),
                                                  UInt64(fileOffset),
                                                  0,
                                                  DWORD(BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT | BASS_ASYNCFILE | BASS_STREAM_PRESCAN))
            } else {
                let newStreamCacher = RelistenStreamCacher(self, streamable: streamable)
                
                streamCacher = newStreamCacher

                NSLog("[relisten-audio-player][bass][stream] buildStream: calling BASS_StreamCreateURL for \(streamable.identifier) with fileOffset=\(fileOffset) numberOfStreamsFetching=\(numberOfStreamsFetching)")

                if fileOffset == 0 {
                    newStream = BASS_StreamCreateURL(streamable.url.absoluteString.cString(using: .utf8),
                                                     fileOffset,
                                                     DWORD(BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT),
                                                     streamDownloadProc,
                                                     // Retain the stream cacher so that it stays alive
                                                     // for the lifetime of the DOWNLOADPROC callbacks.
                                                     // It will be released once the download finishes
                                                     // in `streamDownloadProc`.
                                                     Unmanaged.passRetained(streamCacher!).toOpaque())
                } else {
                    newStream = BASS_StreamCreateURL(streamable.url.absoluteString.cString(using: .utf8),
                                                     fileOffset,
                                                     DWORD(BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT),
                                                     nil,
                                                     nil)

                }
            }

            let timingEnd = DispatchTime.now()
            let streamCreationDurationMs = Int(Double(timingEnd.uptimeNanoseconds - timingStart.uptimeNanoseconds) / 1e6)
            
            let host = streamable.url.host ?? "<unknown host>"
            NSLog("[relisten-audio-player][bass][stream] buildStream: calling BASS_StreamCreate* complete in \(streamCreationDurationMs)ms (\(host)) for stream=\(newStream) identifer=\(streamable.identifier) numberOfStreamsFetching=\(numberOfStreamsFetching)")

            let errorCode = (newStream == 0) ? BASS_ErrorGetCode() : 0

            if newStream == 0 {	
                var err = ErrorForErrorCode(errorCode)

                let issueSource = streamable.url.host?.replacingOccurrences(of: "audio.relisten.net/", with: "") ?? streamable.url.absoluteString

                if errorCode == BASS_ERROR_TIMEOUT {
                    err = NSError(domain: "net.relisten.ios.relisten-audio-player", code: err.code, userInfo: [NSLocalizedDescriptionKey: "Server timeout: Check your Internet connection or maybe \(issueSource) is having issues"])
                } else if errorCode == BASS_ERROR_FILEFORM {
                    err = NSError(domain: "net.relisten.ios.relisten-audio-player", code: err.code, userInfo: [NSLocalizedDescriptionKey: "Non-audio content: \(issueSource) did not provide audio, maybe there are server issues"])
                }

                NSLog("[relisten-audio-player][bass][stream] buildStream: error creating new streamr stream=\(newStream) identifier=\(streamable.identifier): %d %@", err.code, err.localizedDescription)
                
                if (attempts - 1) > 0 {
                    NSLog("[relisten-audio-player][bass][stream] buildStream: retrying for identifier=\(streamable.identifier)")
                    
                    buildStream(streamIntent, fileOffset: fileOffset, channelOffset: channelOffset, attempts: attempts - 1, completion: completion, isRetry: true)
                } else {
                    self.delegateQueue.async {
                        self.delegate?.errorStartingStream(self, error: err, forStreamable: streamable)
                    }

                    self.bassQueue.async { [weak self] in
                        guard let self else { return }
                        
                        self.numberOfStreamsFetching -= 1
                        completion(nil)
                    }
                }

                return
            }
                        
            if let streamCacher {
                // only add the stream cacher after error handling to ensure there's no leak
                StreamCacherRegistry.sharedInstance.register(streamCacher)
            }

            self.bassQueue.async { [weak self] in
                guard let self else { return }

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

                NSLog("[relisten-audio-player][bass][stream] created new stream=%u identifier=%@", newStream, streamable.identifier)

                let stream = RelistenGaplessAudioStream(
                    streamCacher: streamCacher,
                    stream: newStream,
                    fileOffset: fileOffset,
                    channelOffset: channelOffset
                )

                streamIntent.audioStream = stream

                self.fetchAlbumArt(streamIntent: streamIntent)

                numberOfStreamsFetching -= 1
                completion(stream)
            }
        }
    }

    func startPreloadingNextStream() {
        // don't start loading anything until the active stream has finished
        guard let startingNextStreamIntent = nextStreamIntent, activeStream?.preloadFinished == true else {
            return
        }

        NSLog("[relisten-audio-player][bass][preloadNextTrack] Preloading next track \(startingNextStreamIntent.streamable.identifier)")
        
        buildStream(startingNextStreamIntent) { [weak self] stream in
            guard let self else { return }
            
            if startingNextStreamIntent.streamable.identifier != self.nextStreamIntent?.streamable.identifier {
                NSLog("[relisten-audio-player][bass][stream] startPreloadingNextStream: next stream intent changed during buildStream for \(startingNextStreamIntent.streamable.identifier)")

                if let stream {
                    NSLog("[relisten-audio-player][bass][stream] startPreloadingNextStream: tearing down BASS audio stream for \(startingNextStreamIntent.streamable.identifier)")
                    tearDownStream(stream)
                }
                
                return
            }
            
            self.nextStream = stream

            if let nextStream = stream {
                BASS_ChannelUpdate(nextStream.stream, 0)
                nextStream.preloadStarted = true
            }
        }
    }
}

internal var streamDownloadProc: @convention(c) (_ buffer: UnsafeRawPointer?,
                                                 _ length: DWORD,
                                                 _ user: UnsafeMutableRawPointer?) -> Void = {
                                                    buffer, length, user in
                                                    if let streamCacherPtr = user {
                                                        // The pointer was passed using `passRetained` so obtain the
                                                        // unmanaged reference to allow manual release when finished.
                                                        let streamCacherUnmanaged = Unmanaged<RelistenStreamCacher>.fromOpaque(streamCacherPtr)
                                                        let streamCacher = streamCacherUnmanaged.takeUnretainedValue()

                                                        if let safeBuffer = buffer, length > 0 {
                                                            if !streamCacher.tearDownCalled {
                                                                let data = Data(bytes: safeBuffer, count: Int(length))
                                                                streamCacher.writeData(data)
                                                            }
                                                        } else {
                                                            if !streamCacher.tearDownCalled {
                                                                streamCacher.finishWritingData()
                                                            }

                                                            // This should not be called earlier because as long as this proc is called,
                                                            // the pointer needs to be valid.
                                                            StreamCacherRegistry.sharedInstance.discard(streamCacher)

                                                            // Release the reference retained when the stream was created.
                                                            streamCacherUnmanaged.release()
                                                        }
                                                   }
                                                }
