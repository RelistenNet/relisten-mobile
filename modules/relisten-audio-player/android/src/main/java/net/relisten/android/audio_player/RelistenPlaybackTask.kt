package net.relisten.android.audio_player

import android.util.Log
import com.facebook.react.ReactHost
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext

/**
 * Activity pause normally stops React Native timers. Keep scheduling active in the
 * existing runtime while playing/buffering; ExoPlayer separately owns the CPU wake lock.
 */
internal class RelistenPlaybackTask(private val reactHost: ReactHost) : ReactInstanceEventListener {
    private var playbackActive = false
    private var taskContext: ReactContext? = null
    private var taskId: Int? = null

    init {
        reactHost.addReactInstanceEventListener(this)
    }

    fun update(active: Boolean) {
        playbackActive = active
        if (!active) {
            // Paused/stopped playback must not keep app timers running in the background.
            finishTask()
            return
        }

        val context = reactHost.currentReactContext
        if (context != null && context.hasActiveReactInstance()) {
            startTask(context)
        } else {
            // A service can also be entered from an external media controller.
            reactHost.start()
        }
    }

    override fun onReactContextInitialized(context: ReactContext) {
        if (playbackActive) {
            startTask(context)
        }
    }

    fun close() {
        playbackActive = false
        reactHost.removeReactInstanceEventListener(this)
        finishTask()
    }

    private fun startTask(context: ReactContext) {
        if (taskContext === context && taskId != null) {
            return
        }
        finishTask()

        taskContext = context
        taskId = HeadlessJsTaskContext.getInstance(context).startTask(
            HeadlessJsTaskConfig(
                "RelistenPlayback",
                Arguments.createMap(),
                0L, // Music playback has no timeout; the service owns completion.
                true // The task must survive moving between foreground and background.
            )
        )
        Log.i(RELISTEN_AUDIO_PLAYER_LOG_TAG, "playback JS task started id=$taskId")
    }

    private fun finishTask() {
        val context = taskContext
        val id = taskId
        taskContext = null
        taskId = null
        if (context != null && id != null) {
            HeadlessJsTaskContext.getInstance(context).finishTask(id)
            Log.i(RELISTEN_AUDIO_PLAYER_LOG_TAG, "playback JS task finished id=$id")
        }
    }
}
