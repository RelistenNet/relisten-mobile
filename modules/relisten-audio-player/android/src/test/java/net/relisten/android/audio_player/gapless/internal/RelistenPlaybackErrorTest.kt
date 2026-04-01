package net.relisten.android.audio_player.gapless.internal

import androidx.media3.common.PlaybackException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.FileNotFoundException
import java.io.IOException
import javax.net.ssl.SSLHandshakeException

class RelistenPlaybackErrorTest {
    @Test
    fun mapsNetworkUnavailableErrors() {
        val error =
            relistenPlaybackErrorFromFailure(
                errorCode = PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                message = "connection failed",
                cause = IOException("offline")
            )

        assertEquals(RelistenPlaybackErrorKind.NETWORK_UNAVAILABLE, error.kind)
        assertTrue(error.isRetryable)
        assertEquals(PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED, error.platformCode)
    }

    @Test
    fun mapsTimeoutErrors() {
        val error =
            relistenPlaybackErrorFromFailure(
                errorCode = PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
                message = "timed out",
                cause = IOException("timeout")
            )

        assertEquals(RelistenPlaybackErrorKind.NETWORK_TIMEOUT, error.kind)
        assertTrue(error.isRetryable)
    }

    @Test
    fun mapsBadHttpStatusAndPreservesStatusCode() {
        val error =
            relistenPlaybackErrorFromFailure(
                errorCode = PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS,
                message = "bad response",
                cause = IOException("http 503"),
                httpStatusOverride = 503
            )

        assertEquals(RelistenPlaybackErrorKind.HTTP_STATUS, error.kind)
        assertEquals(503, error.httpStatus)
        assertTrue(error.isRetryable)
    }

    @Test
    fun mapsFileNotFoundErrors() {
        val error =
            relistenPlaybackErrorFromFailure(
                errorCode = PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND,
                message = "missing file",
                cause = FileNotFoundException("track missing")
            )

        assertEquals(RelistenPlaybackErrorKind.SOURCE_NOT_FOUND, error.kind)
        assertFalse(error.isRetryable)
    }

    @Test
    fun mapsInvalidMediaErrors() {
        val error =
            relistenPlaybackErrorFromFailure(
                errorCode = PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED,
                message = "malformed container",
                cause = IOException("bad bytes")
            )

        assertEquals(RelistenPlaybackErrorKind.INVALID_MEDIA, error.kind)
        assertFalse(error.isRetryable)
    }

    @Test
    fun mapsDecoderFailuresToAudioPipeline() {
        val error =
            relistenPlaybackErrorFromFailure(
                errorCode = PlaybackException.ERROR_CODE_DECODER_INIT_FAILED,
                message = "decoder blew up",
                cause = IOException("decoder init failed")
            )

        assertEquals(RelistenPlaybackErrorKind.AUDIO_PIPELINE, error.kind)
        assertFalse(error.isRetryable)
    }

    @Test
    fun sslCauseOverridesToSslFailure() {
        val error =
            relistenPlaybackErrorFromFailure(
                errorCode = PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                message = "ssl problem",
                cause = SSLHandshakeException("handshake failed")
            )

        assertEquals(RelistenPlaybackErrorKind.SSL_FAILURE, error.kind)
        assertFalse(error.isRetryable)
    }

    @Test
    fun fallsBackToUnknownWhenNoBetterMappingExists() {
        val error =
            relistenPlaybackErrorFromFailure(
                errorCode = PlaybackException.ERROR_CODE_UNSPECIFIED,
                message = "mystery failure",
                cause = IOException("mystery")
            )

        assertEquals(RelistenPlaybackErrorKind.UNKNOWN, error.kind)
        assertFalse(error.isRetryable)
    }
}
