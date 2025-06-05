//
//  PlaybackUpdates.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation
import MediaPlayer

extension RelistenGaplessAudioPlayer {
    func updateControlCenter() {
        // important to make sure currentDuration and elapsed calls are consistent. BASS is threadsafe but Relisten's
        // stream references are not thread safe.
        self.bassQueue.async { [weak self] in
            guard let self, let activeStreamIntent = self.activeStreamIntent else {
                return
            }

            var nowPlayingInfo = [String: Any]()

            nowPlayingInfo[MPMediaItemPropertyTitle] = activeStreamIntent.streamable.title
            nowPlayingInfo[MPMediaItemPropertyArtist] = activeStreamIntent.streamable.artist
            nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = activeStreamIntent.streamable.albumTitle

            if let activeStream = self.activeStream {
                if let artwork = activeStream.streamableArtwork {
                    nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
                }

                // Set the playback duration and current playback time
                nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = self.currentDuration // in seconds
                nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = self.elapsed // in seconds

                // Set the playback rate (0.0 for paused, 1.0 for playing)
                nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = self.currentState == .Playing ? 1.0 : 0.0
            }

            // Set the nowPlayingInfo
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                
                MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                
                if commandCenter.nextTrackCommand.isEnabled == false || commandCenter.previousTrackCommand.isEnabled == false {
                    NSLog("[relisten-audio-player][playbackUpdates] nextTrackCommand.isEnabled == \(commandCenter.nextTrackCommand.isEnabled)")
                    NSLog("[relisten-audio-player][playbackUpdates] previousTrackCommand.isEnabled == \(commandCenter.previousTrackCommand.isEnabled)")
                    addCommandCenterListeners()
                }
            }
        }
    }

    func getData(from url: URL, completion: @escaping (UIImage?) -> Void) {
        URLSession.shared.dataTask(with: url, completionHandler: {(data, _, _) in
            if let data = data {
                completion(UIImage(data: data))
            }
        })
        .resume()
    }
    
    func fetchAlbumArt(streamIntent: RelistenStreamIntent) {
        guard let stream = streamIntent.audioStream else {
            return
        }
        
        if !stream.fetchingArtwork && stream.streamableArtwork == nil {
            stream.fetchingArtwork = true
            
            fetchAlbumArt(href: streamIntent.streamable.albumArt) { [weak stream, weak self] artwork in
                if let stream = stream, artwork != nil {
                    stream.fetchingArtwork = false
                    stream.streamableArtwork = artwork
                    
                    self?.updateControlCenter()
                }
            }
        }
    }

    func fetchAlbumArt(href: String, completion: @escaping (MPMediaItemArtwork?) -> Void) {
        guard let url = URL(string: href) else { return }
        getData(from: url) { image in
            guard let downloadedImage = image else {
                completion(nil)
                return
            }
            let artwork = MPMediaItemArtwork.init(boundsSize: downloadedImage.size, requestHandler: { _ -> UIImage in
                return downloadedImage
            })
            
            completion(artwork)
        }
    }

    func startUpdates() {
        dispatchPrecondition(condition: .onQueue(bassQueue))
        
        guard let activeStream else {
            return
        }

        let oldElapsed = elapsed ?? 0
        let oldDuration = currentDuration ?? 0
        let prevState = _currentState

        let oldDownloadedBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_DOWNLOAD))
        let oldTotalFileBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_SIZE))

        bassQueue.asyncAfter(deadline: .now() + .milliseconds(100)) { [self] in
            guard let activeStreamIntent, let activeStream = self.activeStream else {
                return
            }

            let thisElapsed = elapsed
            let thisDuration = currentDuration

            let downloadedBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_DOWNLOAD))
            let totalFileBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_SIZE))

            var sendPlaybackChanged = false
            var sendDownloadChanged = false
            var sendStateChanged = false

            if thisElapsed == nil || floor(oldElapsed) != floor(thisElapsed ?? 0) || oldDuration != thisDuration {
                sendPlaybackChanged = true
            }

            let oldKilobytes = floor(Double(oldDownloadedBytes) / (100 * 1024))
            let newKilobytes = floor(Double(downloadedBytes) / (100 * 1024))

            // Only update once per 100 KiB
            if downloadedBytes != UInt64.max && totalFileBytes != UInt64.max && oldTotalFileBytes != UInt64.max && oldDownloadedBytes != UInt64.max,
               (oldKilobytes != newKilobytes || oldTotalFileBytes != totalFileBytes) {
                // don't send download progress for a file url
                // as BASS_FILEPOS_DOWNLOAD or BASS_FILEPOS_BUFFER return -1 here (because we are not streaming the http file)
                if (!activeStreamIntent.streamable.url.isFileURL) {
                    sendDownloadChanged = true
                }
            }

            let thisState = currentState

            if prevState != thisState {
                sendStateChanged = true
            }

            if sendPlaybackChanged || sendStateChanged {
                updateControlCenter()
            }

            if sendPlaybackChanged {
//                NSLog("[relisten-audio-player][playback updates] sendPlaybackChanged elapsed=\(String(describing: thisElapsed)) duration=\(String(describing: thisDuration))")
                delegateQueue.async {
                    self.delegate?.playbackProgressChanged(self, elapsed: thisElapsed, duration: thisDuration)
                }
            }

            if sendDownloadChanged {
//                NSLog("[relisten-audio-player][playback updates] sendDownloadChanged downloadedBytes=\(downloadedBytes) totalBytes=\(totalFileBytes)")
                delegateQueue.async {
                    self.delegate?.downloadProgressChanged(self, forActiveTrack: true, downloadedBytes: downloadedBytes, totalBytes: totalFileBytes)
                }
            }

            if sendStateChanged {
                NSLog("[relisten-audio-player][playback updates] sendStateChanged newPlaybackState=\(thisState)")
                delegateQueue.async {
                    self.delegate?.playbackStateChanged(self, newPlaybackState: thisState)
                }
            }

            startUpdates()
        }
    }
}
