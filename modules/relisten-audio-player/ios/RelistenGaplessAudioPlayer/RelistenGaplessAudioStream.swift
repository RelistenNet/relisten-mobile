//
//  RelistenGaplessAudioStream.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/12/23.
//

import Foundation
import MediaPlayer

public class RelistenGaplessAudioStream {
    var preloadStarted = false
    var preloadFinished = false

    var stream: HSTREAM

    var fileOffset: DWORD
    var channelOffset: QWORD

    let streamable: RelistenGaplessStreamable
    
    var fetchingArtwork: Bool = false
    var streamableArtwork: MPMediaItemArtwork? = nil

    let streamCacher: RelistenStreamCacher?

    public init(streamable: RelistenGaplessStreamable, streamCacher: RelistenStreamCacher?, stream: HSTREAM, preloadStarted: Bool = false, preloadFinished: Bool = false, fileOffset: DWORD = 0, channelOffset: QWORD = 0) {
        self.preloadStarted = preloadStarted
        self.preloadFinished = preloadFinished
        self.stream = stream
        self.fileOffset = fileOffset
        self.channelOffset = channelOffset
        self.streamable = streamable
        self.streamCacher = streamCacher
    }
}
