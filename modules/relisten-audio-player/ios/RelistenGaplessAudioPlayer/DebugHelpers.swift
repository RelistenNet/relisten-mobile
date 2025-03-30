//
//  DebugHelpers.swift
//  RelistenAudioPlayer
//
//  Created by Alec Gorge on 7/13/23.
//

import Foundation

extension RelistenGaplessAudioPlayer {
    func bass_assert(_ x: Int32) {
        if x == 0 {
            NSLog("[relisten-audio-player]\(#file):\(#line) - 🚨🚨🚨 Assertion failed - expected 0, got: %d (%d).", x, BASS_ErrorGetCode())
            // TODO: delegate dispatch for assertion failure
        }
    }

    func bass_assert(_ x: UInt32) {
        if x == 0 {
            NSLog("[relisten-audio-player]\(#file):\(#line) - 🚨🚨🚨 Assertion failed - expected 0, got: %u (%d).", x, BASS_ErrorGetCode())
            // TODO: delegate dispatch for assertion failure
        }
    }
}
