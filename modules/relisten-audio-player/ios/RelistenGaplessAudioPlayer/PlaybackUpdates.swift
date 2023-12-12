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
        guard let activeStream else {
            return
        }
        
        var nowPlayingInfo = [String: Any]()

        // Set metadata for your media
        nowPlayingInfo[MPMediaItemPropertyTitle] = activeStream.streamable.title
        nowPlayingInfo[MPMediaItemPropertyArtist] = activeStream.streamable.artist
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = activeStream.streamable.albumTitle

        // Set the playback duration and current playback time
        nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = self.currentDuration // in seconds
        nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = self.elapsed // in seconds

        // Set the playback rate (0.0 for paused, 1.0 for playing)
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = 1.0

        // Set the nowPlayingInfo
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
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
            
            updateControlCenter();
            
            // Only update once per 100 KiB
            if downloadedBytes != -1 && totalFileBytes != -1 && oldTotalFileBytes != -1 && oldDownloadedBytes != -1,
               oldKilobytes != newKilobytes || oldTotalFileBytes != totalFileBytes
            {
                sendDownloadChanged = true
            }
            
            let thisState = currentState

            if prevState != thisState {
                sendStateChanged = true
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
