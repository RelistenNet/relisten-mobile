@file:UnstableApi

package net.relisten.android.audio_player

import android.app.PendingIntent
import android.content.Intent
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.util.EventLogger
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession

// Keep this service as wiring only; Android Auto browse behavior lives in RelistenMediaLibrary.
class RelistenPlaybackService : MediaLibraryService() {
    private var mediaSession: MediaLibrarySession? = null
    var exoPlayer: ExoPlayer? = null

    override fun onCreate() {
        super.onCreate()

        val player = ExoPlayer.Builder(this)
            .setLoadControl(RelistenLoadControl())
            .setHandleAudioBecomingNoisy(true)
            .build()
        player.setAudioAttributes(relistenAudioAttributes(), true)
        player.addAnalyticsListener(EventLogger())

        val mediaLibrary = RelistenMediaLibrary { mediaSession }
        val sessionPlayer = RelistenSessionPlayer(
            player,
            appPackageName = packageName,
            currentControllerProvider = { mediaSession?.getControllerForCurrentRequest() },
            isNotificationController = { controller ->
                mediaSession?.isMediaNotificationController(controller) == true
            }
        )
        sessionPlayer.addListener(mediaLibrary.playerListener)

        val sessionBuilder = MediaLibrarySession.Builder(
            this,
            sessionPlayer,
            RelistenMediaLibraryCallback(mediaLibrary)
        )
        sessionActivityPendingIntent()?.let { sessionActivity ->
            sessionBuilder.setSessionActivity(sessionActivity)
        }

        mediaSession = sessionBuilder.build()
        exoPlayer = player
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = mediaSession?.player ?: return
        if (!player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        exoPlayer = null
        super.onDestroy()
    }

    override fun onGetSession(
        controllerInfo: MediaSession.ControllerInfo
    ): MediaLibrarySession? {
        Log.i(RELISTEN_AUDIO_PLAYER_LOG_TAG, "media session requested package=${controllerInfo.packageName}")
        return mediaSession
    }

    private fun relistenAudioAttributes(): AudioAttributes {
        return AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()
    }

    private fun sessionActivityPendingIntent(): PendingIntent? {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
        return PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }
}
