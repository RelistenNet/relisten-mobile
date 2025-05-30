//
//  StreamManagement.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation

var allStreamCachers: [RelistenStreamCacher] = []

extension RelistenGaplessAudioPlayer {
    func buildStream(_ streamIntent: RelistenStreamIntent,
                     fileOffset: DWORD = 0,
                     channelOffset: QWORD = 0,
                     attempts: Int = 2,
                     completion: @escaping (RelistenGaplessAudioStream?) -> Void) {
        dispatchPrecondition(condition: .onQueue(bassQueue))

        maybeSetupBASS()

        let streamable = streamIntent.streamable

        networkQueue.async { [weak self] in
            guard let self else { return }

            var newStream: HSTREAM = 0
            var streamCacher: RelistenStreamCacher?

            if streamable.url.isFileURL {
                NSLog("[relisten-audio-player][bass][stream] buildStream: calling BASS_StreamCreateFile for \(streamable.identifier)")
                newStream = BASS_StreamCreateFile(0,
                                                  streamable.url.path.cString(using: .utf8),
                                                  UInt64(fileOffset),
                                                  0,
                                                  DWORD(BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT | BASS_ASYNCFILE | BASS_STREAM_PRESCAN))
            } else {
                let newStreamCacher = RelistenStreamCacher(self, streamable: streamable)
                NSLog("[relisten-audio-player] Added StreamCacher for \(newStreamCacher.streamable.identifier); \(allStreamCachers.count) existing")

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

            let errorCode = (newStream == 0) ? BASS_ErrorGetCode() : 0

            self.bassQueue.async { [weak self] in
                guard let self else { return }

                if newStream == 0 {
                    if errorCode == BASS_ERROR_UNKNOWN {
                        NSLog("[relisten-audio-player][bass][stream] buildStream: error creating new stream, ignoring because it probably means setNextStream was called identifier=\(streamable.identifier): \(errorCode)")
                        completion(nil)
                        return
                    }

                    var err = ErrorForErrorCode(errorCode)

                    let issueSource = streamable.url.host?.replacingOccurrences(of: "audio.relisten.net", with: "archive.org") ?? streamable.url.absoluteString

                    if errorCode == BASS_ERROR_TIMEOUT {
                        err = NSError(domain: "net.relisten.ios.relisten-audio-player", code: err.code, userInfo: [NSLocalizedDescriptionKey: "Server timeout: Check your Internet connection or maybe \(issueSource) is having issues"])
                    } else if errorCode == BASS_ERROR_FILEFORM {
                        err = NSError(domain: "net.relisten.ios.relisten-audio-player", code: err.code, userInfo: [NSLocalizedDescriptionKey: "Non-audio content: \(issueSource) did not provide audio, maybe there are server issues"])
                    }

                    NSLog("[relisten-audio-player][bass][stream] buildStream: error creating new stream identifier=\(streamable.identifier): %d %@", err.code, err.localizedDescription)

                    DispatchQueue.main.async {
                        self.delegate?.errorStartingStream(self, error: err, forStreamable: streamable)
                    }

                    completion(nil)
                    return
                }
                
                if let streamCacher {
                    // only add the stream cacher after error handling to ensure there's no leak
                    allStreamCachers.append(streamCacher)
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

                self.fetchAlbumArt(streamIntent: streamIntent)

                completion(stream)
            }
        }
    }

    func startPreloadingNextStream() {
        // don't start loading anything until the active stream has finished
        guard let nextStreamIntent, activeStream?.preloadFinished == true else {
            return
        }

        NSLog("[relisten-audio-player][bass][preloadNextTrack] Preloading next track \(nextStreamIntent.streamable.identifier)")
        
        buildStream(nextStreamIntent) { [weak self] stream in
            guard let self else { return }
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
