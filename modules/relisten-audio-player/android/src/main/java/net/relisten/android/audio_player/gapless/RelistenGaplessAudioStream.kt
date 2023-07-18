package net.relisten.android.audio_player.gapless

import java.net.URL

data class RelistenGaplessStreamable(val url: URL, val identifier: String)

data class RelistenGaplessAudioStream(val streamable: RelistenGaplessStreamable, val stream: Int) {

}
