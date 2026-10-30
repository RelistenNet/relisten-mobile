package net.relisten.android.audio_player

import android.content.Context

/**
 * Native playback progress is persisted independently of React Native because Android can suspend
 * or kill the JS runtime while the foreground media service keeps playing.
 */
class PlayerStateSnapshotStore(context: Context) {
    private val preferences =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun save(
        trackUuid: String,
        elapsedSeconds: Double?,
        durationSeconds: Double?,
        playbackState: String,
        updatedAtMillis: Long = System.currentTimeMillis()
    ) {
        preferences.edit()
            .putString(KEY_TRACK_UUID, trackUuid)
            .putFloat(KEY_ELAPSED_SECONDS, elapsedSeconds?.toFloat() ?: UNKNOWN_SECONDS)
            .putFloat(KEY_DURATION_SECONDS, durationSeconds?.toFloat() ?: UNKNOWN_SECONDS)
            .putString(KEY_PLAYBACK_STATE, playbackState)
            .putLong(KEY_UPDATED_AT_MILLIS, updatedAtMillis)
            .apply()
    }

    fun read(): Map<String, Any?>? {
        val trackUuid = preferences.getString(KEY_TRACK_UUID, null) ?: return null
        val updatedAtMillis = preferences.getLong(KEY_UPDATED_AT_MILLIS, 0L)

        if (updatedAtMillis <= 0L) {
            return null
        }

        return hashMapOf(
            "trackUuid" to trackUuid,
            "elapsed" to readSeconds(KEY_ELAPSED_SECONDS),
            "duration" to readSeconds(KEY_DURATION_SECONDS),
            "playbackState" to preferences.getString(KEY_PLAYBACK_STATE, null),
            "updatedAtMillis" to updatedAtMillis
        )
    }

    private fun readSeconds(key: String): Double? {
        val seconds = preferences.getFloat(key, UNKNOWN_SECONDS)

        return if (seconds == UNKNOWN_SECONDS) null else seconds.toDouble()
    }

    private companion object {
        const val PREFERENCES_NAME = "relisten_player_state"
        const val KEY_TRACK_UUID = "trackUuid"
        const val KEY_ELAPSED_SECONDS = "elapsedSeconds"
        const val KEY_DURATION_SECONDS = "durationSeconds"
        const val KEY_PLAYBACK_STATE = "playbackState"
        const val KEY_UPDATED_AT_MILLIS = "updatedAtMillis"
        const val UNKNOWN_SECONDS = -1.0f
    }
}
