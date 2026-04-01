package net.relisten.android.audio_player.gapless.internal

import androidx.media3.common.PlaybackException
import androidx.media3.datasource.HttpDataSource
import java.io.FileNotFoundException
import javax.net.ssl.SSLException

enum class RelistenPlaybackErrorKind(val wireValue: String) {
    INVALID_SOURCE("invalidSource"),
    NETWORK_UNAVAILABLE("networkUnavailable"),
    NETWORK_TIMEOUT("networkTimeout"),
    SSL_FAILURE("sslFailure"),
    HTTP_STATUS("httpStatus"),
    SOURCE_NOT_FOUND("sourceNotFound"),
    INVALID_MEDIA("invalidMedia"),
    INSUFFICIENT_DATA("insufficientData"),
    UNSUPPORTED_FORMAT("unsupportedFormat"),
    INCOMPATIBLE_TRACKS("incompatibleTracks"),
    SOURCE_IDENTITY_MISMATCH("sourceIdentityMismatch"),
    INVALID_STATE("invalidState"),
    AUDIO_PIPELINE("audioPipeline"),
    UNKNOWN("unknown"),
}

data class RelistenPlaybackError(
    val kind: RelistenPlaybackErrorKind,
    val message: String,
    val description: String?,
    val isRetryable: Boolean,
    val platform: String = "android",
    val platformCode: Int? = null,
    val platformName: String? = null,
    val httpStatus: Int? = null,
) {
    fun toEventPayload(): HashMap<String, Any?> =
        hashMapOf(
            "kind" to kind.wireValue,
            "message" to message,
            "description" to description,
            "isRetryable" to isRetryable,
            "platform" to platform,
            "platformCode" to platformCode,
            "platformName" to platformName,
            "httpStatus" to httpStatus,
        )
}

internal fun relistenPlaybackErrorFromPlaybackException(error: PlaybackException): RelistenPlaybackError {
    val causes = errorCauseChain(error)
    val httpCause = causes.firstNotNullOfOrNull { it as? HttpDataSource.InvalidResponseCodeException }
    return relistenPlaybackErrorFromFailure(
        errorCode = error.errorCode,
        message = error.message,
        cause = error.cause,
        platformName = playbackExceptionCodeName(error.errorCode),
        httpStatusOverride = httpCause?.responseCode,
    )
}

internal fun relistenPlaybackErrorFromFailure(
    errorCode: Int,
    message: String?,
    cause: Throwable?,
    platformName: String? = playbackExceptionCodeName(errorCode),
    httpStatusOverride: Int? = null,
): RelistenPlaybackError {
    val causes = errorCauseChain(cause)
    val httpStatus =
        httpStatusOverride ?: causes.firstNotNullOfOrNull {
            (it as? HttpDataSource.InvalidResponseCodeException)?.responseCode
        }
    val sslCause = causes.firstOrNull { it is SSLException }
    val fileNotFoundCause = causes.firstOrNull { it is FileNotFoundException }
    val description = describeFailure(message, cause, platformName ?: "unknown")

    val kind =
        when {
            sslCause != null -> RelistenPlaybackErrorKind.SSL_FAILURE
            fileNotFoundCause != null -> RelistenPlaybackErrorKind.SOURCE_NOT_FOUND
            else ->
                when (errorCode) {
                    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ->
                        RelistenPlaybackErrorKind.NETWORK_UNAVAILABLE
                    PlaybackException.ERROR_CODE_TIMEOUT,
                    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ->
                        RelistenPlaybackErrorKind.NETWORK_TIMEOUT
                    PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ->
                        RelistenPlaybackErrorKind.HTTP_STATUS
                    PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND ->
                        RelistenPlaybackErrorKind.SOURCE_NOT_FOUND
                    PlaybackException.ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED ->
                        RelistenPlaybackErrorKind.INVALID_SOURCE
                    PlaybackException.ERROR_CODE_IO_INVALID_HTTP_CONTENT_TYPE,
                    PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED,
                    PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED ->
                        RelistenPlaybackErrorKind.INVALID_MEDIA
                    PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED,
                    PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED,
                    PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES,
                    PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED ->
                        RelistenPlaybackErrorKind.UNSUPPORTED_FORMAT
                    PlaybackException.ERROR_CODE_DECODER_INIT_FAILED,
                    PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED,
                    PlaybackException.ERROR_CODE_DECODING_FAILED,
                    PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED,
                    PlaybackException.ERROR_CODE_AUDIO_TRACK_WRITE_FAILED ->
                        RelistenPlaybackErrorKind.AUDIO_PIPELINE
                    PlaybackException.ERROR_CODE_FAILED_RUNTIME_CHECK,
                    PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW ->
                        RelistenPlaybackErrorKind.INVALID_STATE
                    else -> RelistenPlaybackErrorKind.UNKNOWN
                }
        }

    return RelistenPlaybackError(
        kind = kind,
        message = messageFor(kind),
        description = description,
        isRetryable = isRetryable(kind, httpStatus),
        platformCode = errorCode,
        platformName = platformName,
        httpStatus = httpStatus,
    )
}

private fun messageFor(kind: RelistenPlaybackErrorKind): String =
    when (kind) {
        RelistenPlaybackErrorKind.INVALID_SOURCE -> "Invalid audio source"
        RelistenPlaybackErrorKind.NETWORK_UNAVAILABLE -> "Network unavailable"
        RelistenPlaybackErrorKind.NETWORK_TIMEOUT -> "Network timeout"
        RelistenPlaybackErrorKind.SSL_FAILURE -> "Secure connection failed"
        RelistenPlaybackErrorKind.HTTP_STATUS -> "Server returned an invalid response"
        RelistenPlaybackErrorKind.SOURCE_NOT_FOUND -> "Audio source not found"
        RelistenPlaybackErrorKind.INVALID_MEDIA -> "Invalid media file"
        RelistenPlaybackErrorKind.INSUFFICIENT_DATA -> "Incomplete media data"
        RelistenPlaybackErrorKind.UNSUPPORTED_FORMAT -> "Unsupported audio format"
        RelistenPlaybackErrorKind.INCOMPATIBLE_TRACKS -> "Tracks cannot be played together"
        RelistenPlaybackErrorKind.SOURCE_IDENTITY_MISMATCH -> "Track source changed during playback"
        RelistenPlaybackErrorKind.INVALID_STATE -> "Playback is not ready"
        RelistenPlaybackErrorKind.AUDIO_PIPELINE -> "Audio pipeline failure"
        RelistenPlaybackErrorKind.UNKNOWN -> "Unknown playback error"
    }

private fun isRetryable(kind: RelistenPlaybackErrorKind, httpStatus: Int?): Boolean =
    when (kind) {
        RelistenPlaybackErrorKind.NETWORK_UNAVAILABLE,
        RelistenPlaybackErrorKind.NETWORK_TIMEOUT,
        RelistenPlaybackErrorKind.INSUFFICIENT_DATA,
        RelistenPlaybackErrorKind.SOURCE_IDENTITY_MISMATCH,
        RelistenPlaybackErrorKind.INVALID_STATE -> true
        RelistenPlaybackErrorKind.HTTP_STATUS ->
            httpStatus == 408 || httpStatus == 429 || (httpStatus != null && httpStatus in 500..599)
        else -> false
    }

private fun describeFailure(message: String?, cause: Throwable?, fallback: String): String {
    val segments = buildList {
        message?.takeIf { it.isNotBlank() }?.let(::add)
        var current = cause
        while (current != null) {
            current.message?.takeIf { it.isNotBlank() }?.let(::add)
            current = current.cause
        }
    }

    return segments.distinct().joinToString(": ").ifBlank { fallback }
}

private fun errorCauseChain(error: Throwable?): List<Throwable> =
    buildList {
        var current = error
        while (current != null) {
            add(current)
            current = current.cause
        }
    }

private fun playbackExceptionCodeName(errorCode: Int): String =
    when (errorCode) {
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ->
            "ERROR_CODE_IO_NETWORK_CONNECTION_FAILED"
        PlaybackException.ERROR_CODE_TIMEOUT -> "ERROR_CODE_TIMEOUT"
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ->
            "ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT"
        PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> "ERROR_CODE_IO_BAD_HTTP_STATUS"
        PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND -> "ERROR_CODE_IO_FILE_NOT_FOUND"
        PlaybackException.ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED ->
            "ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED"
        PlaybackException.ERROR_CODE_IO_INVALID_HTTP_CONTENT_TYPE ->
            "ERROR_CODE_IO_INVALID_HTTP_CONTENT_TYPE"
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED ->
            "ERROR_CODE_PARSING_CONTAINER_MALFORMED"
        PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED ->
            "ERROR_CODE_PARSING_MANIFEST_MALFORMED"
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED ->
            "ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED"
        PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED ->
            "ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED"
        PlaybackException.ERROR_CODE_DECODER_INIT_FAILED -> "ERROR_CODE_DECODER_INIT_FAILED"
        PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED -> "ERROR_CODE_DECODER_QUERY_FAILED"
        PlaybackException.ERROR_CODE_DECODING_FAILED -> "ERROR_CODE_DECODING_FAILED"
        PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES ->
            "ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES"
        PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED ->
            "ERROR_CODE_DECODING_FORMAT_UNSUPPORTED"
        PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED ->
            "ERROR_CODE_AUDIO_TRACK_INIT_FAILED"
        PlaybackException.ERROR_CODE_AUDIO_TRACK_WRITE_FAILED ->
            "ERROR_CODE_AUDIO_TRACK_WRITE_FAILED"
        PlaybackException.ERROR_CODE_FAILED_RUNTIME_CHECK -> "ERROR_CODE_FAILED_RUNTIME_CHECK"
        PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW -> "ERROR_CODE_BEHIND_LIVE_WINDOW"
        PlaybackException.ERROR_CODE_UNSPECIFIED -> "ERROR_CODE_UNSPECIFIED"
        else -> "ERROR_CODE_$errorCode"
    }
