@file:UnstableApi

package net.relisten.android.audio_player

import android.util.Log
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

internal class RelistenMediaLibraryCallback(
    private val library: RelistenMediaLibrary
) : MediaLibrarySession.Callback {
    override fun onConnect(
        session: MediaSession,
        controller: MediaSession.ControllerInfo
    ): MediaSession.ConnectionResult {
        Log.i(RELISTEN_AUDIO_PLAYER_LOG_TAG, "media controller connected package=${controller.packageName}")
        return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
            .setAvailableSessionCommands(
                MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS
            )
            .setAvailablePlayerCommands(MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS)
            .build()
    }

    override fun onPlaybackResumption(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
        val items = library.currentItems()
        val startPositionMs =
            if (items.isEmpty()) C.TIME_UNSET else mediaSession.player.currentPosition
        Log.i(
            RELISTEN_AUDIO_PLAYER_LOG_TAG,
            "playback resumption requested package=${controller.packageName} hasActiveItem=${items.isNotEmpty()} count=${items.size}"
        )
        return Futures.immediateFuture(
            MediaSession.MediaItemsWithStartPosition(
                items,
                if (items.isEmpty()) C.INDEX_UNSET else 0,
                startPositionMs
            )
        )
    }

    override fun onGetLibraryRoot(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        params: LibraryParams?
    ): ListenableFuture<LibraryResult<MediaItem>> {
        val hasActiveItem = library.currentItems().isNotEmpty()
        Log.i(
            RELISTEN_AUDIO_PLAYER_LOG_TAG,
            "library root requested package=${browser.packageName} hasActiveItem=$hasActiveItem params=${paramsLogString(params)}"
        )
        return Futures.immediateFuture(LibraryResult.ofItem(library.rootItem(), params))
    }

    override fun onGetChildren(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        parentId: String,
        page: Int,
        pageSize: Int,
        params: LibraryParams?
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        // Android Auto only needs a tiny, fast root: current item plus native-preloaded next item.
        if (parentId != RELISTEN_ROOT_ID) {
            Log.i(
                RELISTEN_AUDIO_PLAYER_LOG_TAG,
                "library children requested for unknown parent=$parentId package=${browser.packageName}"
            )
            return Futures.immediateFuture(
                LibraryResult.ofItemList(emptyList<MediaItem>(), params)
            )
        }

        val libraryItems = library.currentItems()
        val items = library.pagedItems(libraryItems, page, pageSize)
        Log.i(
            RELISTEN_AUDIO_PLAYER_LOG_TAG,
            "library children requested package=${browser.packageName} hasActiveItem=${libraryItems.isNotEmpty()} count=${items.size}"
        )
        return Futures.immediateFuture(LibraryResult.ofItemList(items, params))
    }

    override fun onGetItem(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        mediaId: String
    ): ListenableFuture<LibraryResult<MediaItem>> {
        val item = library.item(mediaId)

        Log.i(
            RELISTEN_AUDIO_PLAYER_LOG_TAG,
            "library item requested mediaId=$mediaId package=${browser.packageName} found=${item != null}"
        )

        val result =
            if (item != null) {
                LibraryResult.ofItem(item, null)
            } else {
                LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE)
            }

        return Futures.immediateFuture(result)
    }

    private fun paramsLogString(params: LibraryParams?): String {
        return if (params == null) {
            "none"
        } else {
            "recent=${params.isRecent} offline=${params.isOffline} suggested=${params.isSuggested}"
        }
    }
}
