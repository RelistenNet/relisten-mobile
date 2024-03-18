package net.relisten.android.audio_player.gapless.internal

import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayer
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioStream
import net.relisten.android.audio_player.gapless.RelistenGaplessStreamable

class StreamManagement internal constructor(private val player: RelistenGaplessAudioPlayer) {
    fun buildStream(streamable: RelistenGaplessStreamable): RelistenGaplessAudioStream {
        return RelistenGaplessAudioStream(
                streamable = streamable,
                mediaItem = MediaItem
                        .Builder()
                        .setUri(streamable.url.toString())
                        .setMediaMetadata(
                                MediaMetadata
                                        .Builder()
                                        .setArtist(streamable.artist)
                                        .setAlbumArtist(streamable.artist)
                                        .setAlbumTitle(streamable.albumTitle)
                                        .setArtworkUri(streamable.albumArtUri())
                                        .setTitle(streamable.title)
                                        .build()
                        )
                        .build(),
        )
    }
}