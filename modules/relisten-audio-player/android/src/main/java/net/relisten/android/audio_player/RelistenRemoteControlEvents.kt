package net.relisten.android.audio_player

import java.util.concurrent.CopyOnWriteArraySet

fun interface RelistenRemoteControlListener {
    fun onRemoteControl(method: String)
}

object RelistenRemoteControlEvents {
    private val listeners = CopyOnWriteArraySet<RelistenRemoteControlListener>()

    fun addListener(listener: RelistenRemoteControlListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: RelistenRemoteControlListener) {
        listeners.remove(listener)
    }

    fun emit(method: String): Boolean {
        listeners.forEach { listener ->
            listener.onRemoteControl(method)
        }

        return listeners.isNotEmpty()
    }
}
