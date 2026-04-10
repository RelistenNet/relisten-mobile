@file:UnstableApi

package net.relisten.android.audio_player

import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaLibraryService.MediaLibrarySession

internal const val RELISTEN_ROOT_ID = "relisten_root"

// Projects the native player's active/preloaded items into Android Auto's driver-safe browse tree.
// TypeScript remains the queue owner; this class must not mirror or derive the full queue.
internal class RelistenMediaLibrary(
    private val sessionProvider: () -> MediaLibrarySession?
) {
    val playerListener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            if (
                events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION) ||
                events.contains(Player.EVENT_MEDIA_METADATA_CHANGED) ||
                events.contains(Player.EVENT_TIMELINE_CHANGED)
            ) {
                notifyChildrenChanged()
            }
        }
    }

    fun rootItem(): MediaItem {
        return MediaItem.Builder()
            .setMediaId(RELISTEN_ROOT_ID)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle("Relisten")
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                    .build()
            )
            .build()
    }

    fun currentItems(): List<MediaItem> {
        val player = sessionProvider()?.player ?: return emptyList()
        val currentIndex = player.currentMediaItemIndex

        if (currentIndex == C.INDEX_UNSET || currentIndex < 0 || currentIndex >= player.mediaItemCount) {
            return emptyList()
        }

        val items = mutableListOf(playableLibraryItem(player.getMediaItemAt(currentIndex)))
        val nextIndex = currentIndex + 1

        if (nextIndex < player.mediaItemCount) {
            items.add(playableLibraryItem(player.getMediaItemAt(nextIndex)))
        }

        return items
    }

    fun item(mediaId: String): MediaItem? {
        return when (mediaId) {
            RELISTEN_ROOT_ID -> rootItem()
            else -> currentItems().firstOrNull { it.mediaId == mediaId }
        }
    }

    fun pagedItems(items: List<MediaItem>, page: Int, pageSize: Int): List<MediaItem> {
        if (page < 0 || pageSize <= 0) {
            return emptyList()
        }

        val fromIndex = page.toLong() * pageSize.toLong()
        if (fromIndex >= items.size) {
            return emptyList()
        }

        val fromIndexInt = fromIndex.toInt()
        return items.subList(fromIndexInt, minOf(fromIndexInt + pageSize, items.size))
    }

    private fun playableLibraryItem(mediaItem: MediaItem): MediaItem {
        return mediaItem
            .buildUpon()
            .setMediaMetadata(
                mediaItem.mediaMetadata
                    .buildUpon()
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                    .build()
            )
            .build()
    }

    private fun notifyChildrenChanged() {
        val items = currentItems()
        val snapshot = LibrarySnapshot.from(items)
        if (lastNotifiedSnapshot == snapshot) {
            return
        }

        lastNotifiedSnapshot = snapshot
        Log.i(
            RELISTEN_AUDIO_PLAYER_LOG_TAG,
            "library children changed hasActiveItem=${items.isNotEmpty()} count=${items.size}"
        )
        sessionProvider()?.notifyChildrenChanged(RELISTEN_ROOT_ID, items.size, null)
    }

    private var lastNotifiedSnapshot: LibrarySnapshot? = null
}

private data class LibrarySnapshot(
    val items: List<LibraryItemSnapshot>
) {
    companion object {
        fun from(items: List<MediaItem>): LibrarySnapshot {
            return LibrarySnapshot(items.map { LibraryItemSnapshot.from(it) })
        }
    }
}

private data class LibraryItemSnapshot(
    val mediaId: String,
    val title: String?,
    val subtitle: String?,
    val description: String?,
    val artist: String?,
    val albumTitle: String?,
    val artworkUri: String?
) {
    companion object {
        fun from(item: MediaItem): LibraryItemSnapshot {
            val metadata = item.mediaMetadata
            return LibraryItemSnapshot(
                mediaId = item.mediaId,
                title = metadata.title?.toString(),
                subtitle = metadata.subtitle?.toString(),
                description = metadata.description?.toString(),
                artist = metadata.artist?.toString(),
                albumTitle = metadata.albumTitle?.toString(),
                artworkUri = metadata.artworkUri?.toString()
            )
        }
    }
}
