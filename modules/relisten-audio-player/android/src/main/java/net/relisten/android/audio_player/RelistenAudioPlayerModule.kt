package net.relisten.android.audio_player

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import net.relisten.android.audio_player.gapless.RelistenGaplessAudioPlayer
import net.relisten.android.audio_player.gapless.RelistenGaplessStreamable
import java.net.URL

class RelistenStreamable: Record {
  @Field
  var url: URL? = null

  @Field
  var identifier: String? = null
}

class RelistenAudioPlayerModule : Module() {
  val player = RelistenGaplessAudioPlayer()

  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  override fun definition() = ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('RelistenAudioPlayer')` in JavaScript.
    Name("RelistenAudioPlayer")

    // Sets constant properties on the module. Can take a dictionary or a closure that returns a dictionary.
    Constants(
      "PI" to Math.PI
    )

    // Defines event names that the module can send to JavaScript.
    Events("onChange")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("play") { streamable: RelistenStreamable ->
      if (streamable.url == null || streamable.identifier == null) {
        return@Function
      }

      player.play(RelistenGaplessStreamable(streamable.url!!, streamable.identifier!!))
    }

    Function("setNextStream") { streamable: RelistenStreamable ->
      if (streamable.url == null || streamable.identifier == null) {
        return@Function
      }

//      player.play(RelistenGaplessStreamable(streamable.url!!, streamable.identifier!!))
    }

    Function("currentStateStr") {
      return@Function "Stopped"
    }


    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("setValueAsync") { value: String ->
      // Send an event to JavaScript.
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }
  }
}
