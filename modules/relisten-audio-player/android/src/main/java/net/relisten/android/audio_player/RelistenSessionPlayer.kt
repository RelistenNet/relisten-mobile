@file:UnstableApi

package net.relisten.android.audio_player

import android.util.Log
import androidx.media3.common.FlagSet
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession

// External media surfaces delegate queue movement to JS; app-originated controller calls are native.
internal class RelistenSessionPlayer(
    player: Player,
    private val appPackageName: String,
    private val currentControllerProvider: () -> MediaSession.ControllerInfo?,
    private val isNotificationController: (MediaSession.ControllerInfo) -> Boolean
) : ForwardingPlayer(player) {
    private var repeatModeState = player.repeatMode
    private var shuffleModeEnabledState = player.shuffleModeEnabled
    private val listeners = mutableSetOf<Player.Listener>()

    override fun addListener(listener: Player.Listener) {
        super.addListener(listener)
        listeners.add(listener)
    }

    override fun removeListener(listener: Player.Listener) {
        super.removeListener(listener)
        listeners.remove(listener)
    }

    override fun setRepeatMode(repeatMode: Int) {
        if (repeatModeState == repeatMode) {
            return
        }

        repeatModeState = repeatMode
        val events = Player.Events(FlagSet.Builder().add(Player.EVENT_REPEAT_MODE_CHANGED).build())
        listeners.forEach { listener ->
            listener.onRepeatModeChanged(repeatMode)
            listener.onEvents(this, events)
        }
    }

    override fun getRepeatMode(): Int {
        return repeatModeState
    }

    override fun setShuffleModeEnabled(shuffleModeEnabled: Boolean) {
        if (shuffleModeEnabledState == shuffleModeEnabled) {
            return
        }

        shuffleModeEnabledState = shuffleModeEnabled
        val events =
            Player.Events(FlagSet.Builder().add(Player.EVENT_SHUFFLE_MODE_ENABLED_CHANGED).build())
        listeners.forEach { listener ->
            listener.onShuffleModeEnabledChanged(shuffleModeEnabled)
            listener.onEvents(this, events)
        }
    }

    override fun getShuffleModeEnabled(): Boolean {
        return shuffleModeEnabledState
    }

    override fun seekToPrevious() {
        if (!shouldEmitRemoteControlEvent() || !RelistenRemoteControlEvents.emit("prevTrack")) {
            super.seekToPrevious()
        }
    }

    override fun seekToNextMediaItem() {
        if (!shouldEmitRemoteControlEvent() || !RelistenRemoteControlEvents.emit("nextTrack")) {
            super.seekToNextMediaItem()
        }
    }

    override fun seekToNext() {
        if (!shouldEmitRemoteControlEvent() || !RelistenRemoteControlEvents.emit("nextTrack")) {
            super.seekToNext()
        }
    }

    private fun shouldEmitRemoteControlEvent(): Boolean {
        val controller = currentControllerProvider()

        if (controller == null) {
            Log.i(RELISTEN_AUDIO_PLAYER_LOG_TAG, "remote control command with no controller; emitting")
            return true
        }

        val isNotification = isNotificationController(controller)
        val shouldEmit = controller.packageName != appPackageName || isNotification

        Log.i(
            RELISTEN_AUDIO_PLAYER_LOG_TAG,
            "remote control command package=${controller.packageName} notification=$isNotification emit=$shouldEmit"
        )

        return shouldEmit
    }
}
