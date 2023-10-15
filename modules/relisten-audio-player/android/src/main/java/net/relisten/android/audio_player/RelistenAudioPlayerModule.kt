package net.relisten.android.audio_player

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.launch
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayer
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayerDelegate
import net.relisten.android.audio_player.gapless.RelistenGaplessStreamable
import net.relisten.android.audio_player.gapless.RelistenPlaybackState
import net.relisten.android.audio_player.gapless.internal.BASSException
import java.net.URL

class RelistenStreamable : Record {
    @Field
    var url: URL? = null

    @Field
    var identifier: String? = null
}

class RelistenAudioPlayerModule : Module(), RelistenGaplessAudioPlayerDelegate {
    var player: RelistenGaplessAudioPlayer? = null

    // Each module class must implement the definition function. The definition consists of components
    // that describes the module's functionality and behavior.
    // See https://docs.expo.dev/modules/module-api for more details about available components.
    override fun definition() = ModuleDefinition {
        // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
        // Can b ->ferred from module' class name, but it's recommended to set it explicitly for clarity.
        // The module will be accessible from requireNativeModule('RelistenAudioPlayer') -> JavaScript.
        Name("RelistenAudioPlayer")

        OnCreate {
            player = RelistenGaplessAudioPlayer()
            player?.delegate = this@RelistenAudioPlayerModule
        }

        OnDestroy {
            val player = player

            if (player != null) {
                player.stop()
                player
            }
        }

        Events("onError")
        Events("onPlaybackStateChanged")
        Events("onPlaybackProgressChanged")
        Events("onDownloadProgressChanged")
        Events("onTrackChanged")

        Function("currentDuration") {
            return@Function player?.currentDuration
        }

        Function("currentState") {
            return@Function player?.currentState ?: RelistenPlaybackState.Stopped
        }

        Function("currentStateStr") {
            return@Function (player?.currentState ?: RelistenPlaybackState.Stopped).toString()
        }

        Function("elapsed") {
            return@Function player?.elapsed
        }

        Function("volume") {
            return@Function player?.volume ?: 0.0
        }

        Function("setVolume") { newVolume: Float ->
            player?.volume = newVolume
        }

        Function("prepareAudioSession") {
            player?.prepareAudioSession()
        }

        AsyncFunction("playbackProgress") { promise: Promise ->
            player?.scope?.launch {
                val player = player

                if (player == null) {
                    promise.resolve(hashMapOf("playbackProgress" to null))
                    return@launch
                }

                promise.resolve(
                    hashMapOf(
                        "playbackProgress" to hashMapOf(
                            "elapsed" to player.elapsed,
                            "duration" to player.currentDuration,
                        ),
                        "activeTrackDownloadProgress" to hashMapOf(
                            "forActiveTrack" to true,
                            "downloadedBytes" to player.activeTrackDownloadedBytes as Any,
                            "totalBytes" to player.activeTrackTotalBytes as Any,
                        )
                    )
                )
            }
        }

        AsyncFunction("play") { streamable: RelistenStreamable, promise: Promise ->
            val url = streamable.url
            val identifier = streamable.identifier

            if (url != null && identifier != null) {
                player?.play(RelistenGaplessStreamable(url, identifier))
            }

            promise.resolve(null)
        }

        Function("setNextStream") { streamable: RelistenStreamable ->
            val url = streamable.url
            val identifier = streamable.identifier

            if (url == null || identifier == null) {
                return@Function
            }

            player?.setNextStream(RelistenGaplessStreamable(url, identifier))
        }

        AsyncFunction("resume") { promise: Promise ->
            player?.scope?.launch {
                player?.resume()
                promise.resolve(null)
            }
        }

        AsyncFunction("pause") { promise: Promise ->
            player?.scope?.launch {
                player?.pause()
                promise.resolve(null)
            }
        }

        AsyncFunction("stop") { promise: Promise ->
            player?.scope?.launch {
                player?.stop()
                promise.resolve(null)
            }
        }

        AsyncFunction("next") { promise: Promise ->
            player?.scope?.launch {
                player?.next()
                promise.resolve(null)
            }
        }

        AsyncFunction("seekTo") { pct: Double, promise: Promise ->
            player?.scope?.launch {
                player?.seekTo(pct)
                promise.resolve(null)
            }
        }
    }

    override fun errorStartingStream(
        player: RelistenGaplessAudioPlayer,
        error: BASSException,
        forStreamable: RelistenGaplessStreamable
    ) {
        sendEvent(
            "onError", hashMapOf(
                "error" to error.code,
                "errorDescription" to error.message,
                "identifier" to forStreamable.identifier,
            )
        )
    }

    override fun playbackStateChanged(
        player: RelistenGaplessAudioPlayer,
        newPlaybackState: RelistenPlaybackState
    ) {
        sendEvent(
            "onPlaybackStateChanged", hashMapOf(
                "newPlaybackState" to newPlaybackState.toString(),
            )
        )
    }

    override fun playbackProgressChanged(
        player: RelistenGaplessAudioPlayer,
        elapsed: Double?,
        duration: Double?
    ) {
        sendEvent(
            "onPlaybackProgressChanged", hashMapOf(
                "elapsed" to elapsed,
                "duration" to duration,
            )
        )
    }

    override fun downloadProgressChanged(
        player: RelistenGaplessAudioPlayer,
        forActiveTrack: Boolean,
        downloadedBytes: Long,
        totalBytes: Long
    ) {
        sendEvent(
            "onDownloadProgressChanged", hashMapOf(
                "forActiveTrack" to forActiveTrack,
                "downloadedBytes" to downloadedBytes,
                "totalBytes" to totalBytes,
            )
        )
    }

    override fun trackChanged(
        player: RelistenGaplessAudioPlayer,
        previousStreamable: RelistenGaplessStreamable,
        currentStreamable: RelistenGaplessStreamable?
    ) {
        sendEvent(
            "onTrackChanged", hashMapOf(
                "previousIdentifier" to previousStreamable.identifier,
                "currentIdentifier" to currentStreamable?.identifier,
            )
        )
    }

    override fun audioSessionWasSetup(player: RelistenGaplessAudioPlayer) {

    }
}
