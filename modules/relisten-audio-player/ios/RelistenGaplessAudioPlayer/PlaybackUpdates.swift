//
//  PlaybackUpdates.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation
import MediaPlayer

extension RelistenGaplessAudioPlayer {
    func updateControlCenter(artwork: MPMediaItemArtwork?) {
        guard let activeStream else {
            return
        }

        var nowPlayingInfo = [String: Any]()

        // Set metadata for your media
        nowPlayingInfo[MPMediaItemPropertyTitle] = activeStream.streamable.title
        nowPlayingInfo[MPMediaItemPropertyArtist] = activeStream.streamable.artist
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = activeStream.streamable.albumTitle

        if artwork != nil {
            nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
        }

        // Set the playback duration and current playback time
        nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = self.currentDuration // in seconds
        nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = self.elapsed // in seconds

        // Set the playback rate (0.0 for paused, 1.0 for playing)
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = 1.0

        // Set the nowPlayingInfo
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }

    func getData(from url: URL, completion: @escaping (UIImage?) -> Void) {
        URLSession.shared.dataTask(with: url, completionHandler: {(data, _, _) in
            if let data = data {
                completion(UIImage(data: data))
            }
        })
        .resume()
    }

    func fetchAlbumArt(href: String) {
        guard let url = URL(string: href) else { return }
        getData(from: url) { [weak self] image in
            guard let self = self,
                  let downloadedImage = image else {
                return
            }
            let artwork = MPMediaItemArtwork.init(boundsSize: downloadedImage.size, requestHandler: { _ -> UIImage in
                return downloadedImage
            })
            self.updateControlCenter(artwork: artwork)
        }
    }

    func startUpdates() {
        guard let activeStream else {
            return
        }

        let oldElapsed = elapsed ?? 0
        let oldDuration = currentDuration ?? 0
        let prevState = _currentState

        let oldDownloadedBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_DOWNLOAD))
        let oldTotalFileBytes = BASS_StreamGetFilePosition(activeStream.stream, DWORD(BASS_FILEPOS_SIZE))

        bassQueue.asyncAfter(deadline: .now() + .milliseconds(100)) { [self] in
            guard let activeStream = self.activeStream else {
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
                if (!activeStream.streamable.url.isFileURL) {
                    sendDownloadChanged = true
                }
            }

            let thisState = currentState

            if prevState != thisState {
                sendStateChanged = true
            }

            if sendPlaybackChanged || sendStateChanged {
                updateControlCenter(artwork: nil)
            }

            if sendPlaybackChanged {
                NSLog("[playback updates] sendPlaybackChanged")
                self.delegate?.playbackProgressChanged(self, elapsed: thisElapsed, duration: thisDuration)
            }

            if sendDownloadChanged {
                NSLog("[playback updates] sendDownloadChanged")
                self.delegate?.downloadProgressChanged(self, forActiveTrack: true, downloadedBytes: downloadedBytes, totalBytes: totalFileBytes)
            }

            if sendStateChanged {
                NSLog("[playback updates] sendStateChanged")
                self.delegate?.playbackStateChanged(self, newPlaybackState: thisState)
            }

            startUpdates()
        }
    }
}
