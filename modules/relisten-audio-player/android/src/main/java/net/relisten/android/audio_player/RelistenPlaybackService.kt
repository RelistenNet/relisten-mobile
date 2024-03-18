@file:UnstableApi

package net.relisten.android.audio_player

import android.content.Intent
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.upstream.DefaultAllocator
import androidx.media3.exoplayer.util.EventLogger
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService


class RelistenPlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null
    var exoPlayer: ExoPlayer? = null

    // Create your Player and MediaSession in the onCreate lifecycle event
    override fun onCreate() {
        super.onCreate()

        val player = ExoPlayer.Builder(this).setLoadControl(RelistenLoadControl()).build()
        player.addAnalyticsListener(EventLogger())

        mediaSession = MediaSession.Builder(this, player).build()

        exoPlayer = player
    }

    // The user dismissed the app from the recent tasks
    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = mediaSession?.player!!
        if (!player.playWhenReady || player.mediaItemCount == 0) {
            // Stop the service if not playing, continue playing in the background
            // otherwise.
            stopSelf()
        }
    }

    // Remember to release the player and media session in onDestroy
    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }

    // This example always accepts the connection request
    override fun onGetSession(
            controllerInfo: MediaSession.ControllerInfo
    ): MediaSession? {
        return mediaSession
    }
}


class RelistenLoadControl : DefaultLoadControl(DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE),
        // this behavior replicates iOS. probably not the most optimal but required for good hits on
        // full song caching
        1_000 * 60 * 60 * 2 /* 2 hour, default 50 seconds */,
        1_000 * 60 * 60 * 2 /* 2 hour, default 50 seconds */,
        DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,
        DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
        DefaultLoadControl.DEFAULT_TARGET_BUFFER_BYTES,
        true,
        DefaultLoadControl.DEFAULT_BACK_BUFFER_DURATION_MS,
        DefaultLoadControl.DEFAULT_RETAIN_BACK_BUFFER_FROM_KEYFRAME) {

}