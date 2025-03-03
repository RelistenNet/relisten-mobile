package net.relisten.android.audio_player

import android.util.Log
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
import net.relisten.android.audio_player.gapless.internal.RelistenPlaybackException
import java.net.URL

class RelistenStreamable : Record {
    @Field
    var url: URL? = null

    @Field
    var identifier: String? = null

    @Field
    var title: String? = null

    @Field
    var albumTitle: String? = null

    @Field
    var albumArt: String? = null

    @Field
    var artist: String? = null

    @Field
    var downloadDestination: URL? = null

    fun toGaplessStreamable(): RelistenGaplessStreamable? {
        if (url != null && identifier != null && title != null && albumTitle != null && albumArt != null && artist != null) {
            return RelistenGaplessStreamable(url!!, identifier!!, title!!, artist!!, albumTitle!!, albumArt!!, downloadDestination)
        }

        return null
    }
}

class RelistenAudioPlayerModule : Module(), RelistenGaplessAudioPlayerDelegate {
    var player: RelistenGaplessAudioPlayer? = null

    // Each module class must implement the definition function. The definition consists of components
    // that describes the module's functionality and behavior.
    // See https://docs.expo.dev/modules/module-api for more details about available components.
    override fun definition() = ModuleDefinition {
        // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
        // Can be inferred from module' class name, but it's recommended to set it explicitly for clarity.
        // The module will be accessible from requireNativeModule('RelistenAudioPlayer') -> JavaScript.
        Name("RelistenAudioPlayer")

        OnCreate {
            player = RelistenGaplessAudioPlayer(appContext)
            player?.delegate = this@RelistenAudioPlayerModule
        }

        OnDestroy {
            val thisPlayer = player

            if (thisPlayer != null) {
                thisPlayer.stop()
                thisPlayer.teardown()
            }

            player = null
        }

        Events("onError", "onPlaybackStateChanged", "onPlaybackProgressChanged", "onDownloadProgressChanged", "onTrackChanged")

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

        AsyncFunction("play") { streamable: RelistenStreamable, startingAtPct: Double?, promise: Promise ->
            player?.scope?.launch {
                val gaplessStreamable = streamable.toGaplessStreamable()

                if (gaplessStreamable != null) {
                    Log.e("relisten-audio", "player?.play")
                    player?.play(gaplessStreamable)
                    Log.e("relisten-audio", "after player?.play")
                }

                Log.e("relisten-audio", "promise.resolve")
                promise.resolve(null)
                Log.e("relisten-audio", "after promise.resolve")
            }
        }

        Function("setNextStream") { streamable: RelistenStreamable? ->
            if (streamable == null) {
                player?.setNextStream(null)
                return@Function
            }

            val gaplessStreamable = streamable.toGaplessStreamable()

            if (gaplessStreamable != null) {
                player?.setNextStream(gaplessStreamable)
            }

            return@Function
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
            error: RelistenPlaybackException,
            forStreamable: RelistenGaplessStreamable
    ) {
        if (this.player == null) {
            return
        }

        sendEvent(
            "onError", hashMapOf(
                "error" to error.code,
                "errorMessage" to error.message,
                "errorDescription" to error.description,
                "identifier" to forStreamable.identifier,
            )
        )
    }

    override fun playbackStateChanged(
        player: RelistenGaplessAudioPlayer,
        newPlaybackState: RelistenPlaybackState
    ) {
        if (this.player == null) {
            return
        }

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
        if (this.player == null) {
            return
        }

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
        if (this.player == null) {
            return
        }

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
        previousStreamable: RelistenGaplessStreamable?,
        currentStreamable: RelistenGaplessStreamable?
    ) {
        if (this.player == null) {
            return
        }

        sendEvent(
            "onTrackChanged", hashMapOf(
                "previousIdentifier" to previousStreamable?.identifier,
                "currentIdentifier" to currentStreamable?.identifier,
            )
        )
    }

    override fun audioSessionWasSetup(player: RelistenGaplessAudioPlayer) {

    }
}
