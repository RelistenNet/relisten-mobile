package net.relisten.android.audio_player.gapless

import android.net.Uri
import androidx.media3.common.MediaItem
import java.net.URL

data class RelistenGaplessStreamable(
        val url: URL,
        val identifier: String,
        val title: String,
        val artist: String,
        val albumTitle: String,
        val albumArt: String,
        val downloadDestination: URL?
) {
    fun isFileUrl(): Boolean {
        return url.protocol == "file"
    }

    fun albumArtUri(): Uri? {
        return try {
            Uri.parse(albumArt)
        } catch (e: Exception) {
            null
        }
    }
}


data class RelistenGaplessAudioStream(
        val streamable: RelistenGaplessStreamable,
        var mediaItem: MediaItem,
        var preloadStarted: Boolean = false,
        var preloadFinished: Boolean = false,
) {
}
