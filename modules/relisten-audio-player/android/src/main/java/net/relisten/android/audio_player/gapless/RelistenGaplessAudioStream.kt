package net.relisten.android.audio_player.gapless

import java.net.URL

data class RelistenGaplessStreamable(val url: URL, val identifier: String) {
    fun isFileUrl(): Boolean {
        return url.protocol == "file"
    }
}

data class RelistenGaplessAudioStream(
    val streamable: RelistenGaplessStreamable,
    var stream: Int,
    var preloadStarted: Boolean = false,
    var preloadFinished: Boolean = false,
    var fileOffset: Long = 0,
    var channelOffset: Long = 0
) {
}
