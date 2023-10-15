package net.relisten.android.audio_player.gapless.internal

import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayer

class RelistenMediaSession internal constructor(private val player: RelistenGaplessAudioPlayer) {
    internal fun setupAudioSession(shouldActivate: Boolean) {

    }

    internal fun tearDownAudioSession() {

    }

    internal fun restartPlayback() {
        tearDownAudioSession()
        setupAudioSession(shouldActivate = true)

        /*
        bassQueue.async {[self] in
                let savedActiveStreamable = activeStream?.streamable
                let nextStreamable = nextStream?.streamable

                maybeTearDownBASS()

            currentState = .Stopped

                    if let savedActiveStreamable {
                        playStreamableImmediately(savedActiveStreamable)
                    }

            if let nextStreamable {
                self.nextStream = buildStream(nextStreamable)
            }
        }
        */
    }
}