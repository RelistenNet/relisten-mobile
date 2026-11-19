import {
  PlaybackFlags,
  type PlaybackHistoryEntry,
} from '@/relisten/realm/models/history/playback_history_entry';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';

/**
 * Wire shapes for `POST /v1/history/plays:batch` on the User Service, from
 * `docs/plans/active/2026-11-18-cloud-play-history.md` in RelistenApi. The
 * account stores each play once by `play_id` and `qualified_at`, so a retry
 * must send exactly the same values.
 */

/** The server's cap on plays per request. */
export const MAX_PLAYS_PER_BATCH = 500;

export interface PlayUpload {
  play_id: string;
  track_id: string;
  qualified_at: string;
  started_at: string;
  /** The same values as anonymous play counts: 1 iOS, 4 Android. */
  app_type: 1 | 4;
  offline: boolean;
  origin: 'live';
  playlist_id?: string;
  playlist_entry_id?: string;
  catalog_duration_ms?: number;
}

/**
 * Every status means the account is done with the play: `accepted` stored it,
 * `duplicate` already had it, `rejected` never will (a malformed row, or one
 * outside the server's time window). None is sent again.
 */
export interface PlayBatchResponse {
  contract_version: 1;
  results: { play_id: string | null; status: 'accepted' | 'duplicate' | 'rejected' }[];
}

/** The upload for an account row. Built from stored values only, so every retry is identical. */
export function playUploadOf(entry: PlaybackHistoryEntry, platform: string): PlayUpload {
  const upload: PlayUpload = {
    play_id: entry.playId!,
    track_id: formatUuidTypedId('track', entry.sourceTrack.uuid),
    qualified_at: entry.createdAt.toISOString(),
    started_at: entry.playbackStartedAt.toISOString(),
    app_type: platform === 'android' ? 4 : 1,
    offline: (entry.playbackFlags & PlaybackFlags.Offline) !== 0,
    origin: 'live',
  };
  if (entry.playlistId) {
    upload.playlist_id = entry.playlistId;
  }
  if (entry.playlistEntryId) {
    upload.playlist_entry_id = entry.playlistEntryId;
  }
  if (entry.catalogDurationMs != null) {
    upload.catalog_duration_ms = entry.catalogDurationMs;
  }
  return upload;
}
