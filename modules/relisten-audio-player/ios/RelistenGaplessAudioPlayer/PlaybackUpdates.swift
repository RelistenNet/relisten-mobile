//
//  PlaybackUpdates.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation

extension RelistenGaplessAudioPlayer {
    func startUpdates() {
        guard let activeStream else {
            return
        }

        let oldElapsed = elapsed ?? 0
        let oldDuration = currentDuration ?? 0
        let prevState = _currentState

        let oldDownloadedBytes = BASS_StreamGetFilePosition(activeStream.stream, UInt32(BASS_FILEPOS_DOWNLOAD))
        let oldTotalFileBytes = BASS_StreamGetFilePosition(activeStream.stream, UInt32(BASS_FILEPOS_SIZE))

        bassQueue.asyncAfter(deadline: .now() + .milliseconds(100)) { [self] in
            guard let activeStream = self.activeStream else {
                return
            }

            let thisElapsed = elapsed
            let thisDuration = currentDuration

            let downloadedBytes = BASS_StreamGetFilePosition(activeStream.stream, UInt32(BASS_FILEPOS_DOWNLOAD))
            let totalFileBytes = BASS_StreamGetFilePosition(activeStream.stream, UInt32(BASS_FILEPOS_SIZE))

            var sendPlaybackChanged = false
            var sendDownloadChanged = false
            var sendStateChanged = false

            if oldElapsed != thisElapsed || oldDuration != thisDuration {
                sendPlaybackChanged = true
            }

            if downloadedBytes != -1 || totalFileBytes != -1 || oldTotalFileBytes != -1 || oldTotalFileBytes != -1,
               oldDownloadedBytes != downloadedBytes || oldTotalFileBytes != totalFileBytes
            {
                sendDownloadChanged = true
            }

            let currState = currentState

            if prevState != currState {
                sendStateChanged = true
            }

            if sendStateChanged || sendDownloadChanged || sendPlaybackChanged {
                DispatchQueue.main.async {
                    if sendPlaybackChanged {
                        delegate?.playbackProgressChanged(self, elapsed: thisElapsed, duration: thisDuration)
                    }

                    if sendDownloadChanged {
                        delegate?.downloadProgressChanged(self, forActiveTrack: true, downloadedBytes: downloadedBytes, totalBytes: totalFileBytes)
                    }

                    if sendStateChanged {
                        delegate?.playbackStateChanged(self, newPlaybackState: currState)
                    }
                }
            }

            startUpdates()
        }
    }
}
