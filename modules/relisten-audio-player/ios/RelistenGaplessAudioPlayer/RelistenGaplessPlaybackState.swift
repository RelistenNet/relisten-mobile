//
//  RelistenGaplessPlaybackState.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/12/23.
//

import Foundation

public enum PlaybackState {
    case Stopped
    case Playing
    case Paused
    case Stalled
}

public enum PlaybackStreamError {
    case Init
    case NotAvail
    case NoInternet
    case InvalidUrl
    case SslUnsupported
    case ServerTimeout
    case CouldNotOpenFile
    case FileInvalidFormat
    case SupportedCodec
    case UnsupportedSampleFormat
    case InsufficientMemory
    case No3D
    case Unknown
}
