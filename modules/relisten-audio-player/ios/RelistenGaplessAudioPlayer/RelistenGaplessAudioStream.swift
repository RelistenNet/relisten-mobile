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

    var fetchingArtwork: Bool = false
    var streamableArtwork: MPMediaItemArtwork? = nil

    let streamCacher: RelistenStreamCacher?

    public init(streamCacher: RelistenStreamCacher?, stream: HSTREAM, preloadStarted: Bool = false, preloadFinished: Bool = false, fileOffset: DWORD = 0, channelOffset: QWORD = 0) {
        self.preloadStarted = preloadStarted
        self.preloadFinished = preloadFinished
        self.stream = stream
        self.fileOffset = fileOffset
        self.channelOffset = channelOffset
        self.streamCacher = streamCacher
    }
}


public class RelistenStreamIntent {
    let streamable: RelistenGaplessStreamable
    var audioStream: RelistenGaplessAudioStream? = nil
    
    let createdAt: Date
    let startingAtMs: Int64?
    
    public init(streamable: RelistenGaplessStreamable, createdAt: Date? = nil, audioStream: RelistenGaplessAudioStream? = nil, startingAtMs: Int64? = nil) {
        self.streamable = streamable
        self.audioStream = audioStream
        
        self.createdAt = createdAt ?? Date()
        self.startingAtMs = startingAtMs
    }
}
