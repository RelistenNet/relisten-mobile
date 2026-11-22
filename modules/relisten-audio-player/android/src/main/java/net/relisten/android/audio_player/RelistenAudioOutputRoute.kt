package net.relisten.android.audio_player

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper

/**
 * Where this phone's media audio goes, in the same shape the iOS module
 * reports, so the player can show a Bluetooth or headphones icon instead of
 * one that could be mistaken for a Sonos room. It only reads the route and
 * never changes it.
 */
internal class RelistenAudioOutputRoute(
    context: Context,
    private val onChange: (Map<String, Any>) -> Unit,
) {
    private val audioManager = context.getSystemService(AudioManager::class.java)

    // Connecting or disconnecting an output (Bluetooth, headphones, USB) is
    // what moves media audio, so device changes are when the route is read again.
    private val deviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) =
            onChange(current())

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) =
            onChange(current())
    }

    fun start() {
        audioManager.registerAudioDeviceCallback(deviceCallback, Handler(Looper.getMainLooper()))
    }

    fun stop() {
        audioManager.unregisterAudioDeviceCallback(deviceCallback)
    }

    fun current(): Map<String, Any> {
        val device = mediaOutput()
        val kind = device?.let { kindOf(it.type) } ?: BUILT_IN

        if (device == null || kind == BUILT_IN) {
            return mapOf("name" to "", "isExternal" to false, "kind" to BUILT_IN)
        }

        return mapOf("name" to device.productName.toString(), "isExternal" to true, "kind" to kind)
    }

    /**
     * Android 13 and later say which device media plays on. Earlier versions
     * only list what is connected, and Android sends media to Bluetooth, then
     * wired outputs, ahead of the speaker.
     */
    private fun mediaOutput(): AudioDeviceInfo? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            audioManager.getAudioDevicesForAttributes(MEDIA_ATTRIBUTES).firstOrNull()?.let {
                return it
            }
        }

        val outputs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        return listOf(BLUETOOTH, WIRED).firstNotNullOfOrNull { kind ->
            outputs.firstOrNull { kindOf(it.type) == kind }
        }
    }

    private companion object {
        const val BUILT_IN = "builtIn"
        const val BLUETOOTH = "bluetooth"
        const val WIRED = "wired"

        val MEDIA_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()

        fun kindOf(type: Int): String = when (type) {
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE,
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> BUILT_IN

            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_BLE_HEADSET,
            AudioDeviceInfo.TYPE_BLE_SPEAKER,
            AudioDeviceInfo.TYPE_BLE_BROADCAST,
            AudioDeviceInfo.TYPE_HEARING_AID -> BLUETOOTH

            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_USB_HEADSET,
            AudioDeviceInfo.TYPE_USB_DEVICE,
            AudioDeviceInfo.TYPE_USB_ACCESSORY,
            AudioDeviceInfo.TYPE_LINE_ANALOG,
            AudioDeviceInfo.TYPE_LINE_DIGITAL,
            AudioDeviceInfo.TYPE_AUX_LINE -> WIRED

            else -> "other"
        }
    }
}
