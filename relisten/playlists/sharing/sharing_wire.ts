import type { PlaylistSnapshotResponse } from '@/relisten/playlists/sync/playlist_wire';
import { isUuidV7TypedId } from '@/relisten/util/typed_uuid_id';

/**
 * Wire shapes for playlist sharing, from `docs/api/playlist-sharing.md` in
 * RelistenApi. JSON is snake_case.
 */

/** Public codes are 32 lowercase hex characters: `relisten.net/playlists/<code>`. */
const PUBLIC_CODE = /^[0-9a-f]{32}$/;

export function isPublicCode(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_CODE.test(value);
}

export function publicPlaylistUrl(publicCode: string) {
  return `https://relisten.net/playlists/${publicCode}`;
}

export interface PublicPlaylistOwner {
  id: string;
  username: string;
}

/** The authored structure of a public playlist, read without credentials. */
export interface PublicPlaylistSnapshot {
  contract_version: 1;
  history_generation: string;
  playlist_id: string;
  public_code: string;
  revision: number;
  owner: PublicPlaylistOwner;
  metadata: PlaylistSnapshotResponse['metadata'];
  segments: PlaylistSnapshotResponse['segments'];
}

/**
 * A followed playlist in the library feed. A public one carries what the list
 * shows and the revision to pull; an unavailable one (private, taken down or
 * deleted) carries only its ID.
 */
export type FollowedPlaylistHead =
  | {
      playlist_id: string;
      available: true;
      public_code: string;
      name: string;
      owner: PublicPlaylistOwner;
      revision: number;
    }
  | { playlist_id: string; available: false };

export interface PlaylistPublicationResponse {
  contract_version: 1;
  history_generation: string;
  playlist_id: string;
  published: boolean;
  public_code: string | null;
  changed: boolean;
}

export interface PlaylistCreatedResponse {
  contract_version: 1;
  history_generation: string;
  playlist_id: string;
  revision: number;
}

/** The longest report reason the server accepts. */
export const REPORT_REASON_LENGTH = 300;

/**
 * Checks a public snapshot before it is shown or stored: it is the one fetched,
 * and its IDs are the kinds the playlist tables hold.
 */
export function parsePublicSnapshot(value: unknown, publicCode: string): PublicPlaylistSnapshot {
  const snapshot = value as PublicPlaylistSnapshot;
  const valid =
    snapshot?.contract_version === 1 &&
    snapshot.public_code === publicCode &&
    isUuidV7TypedId(snapshot.playlist_id, 'playlist') &&
    isUuidV7TypedId(snapshot.owner?.id, 'user') &&
    typeof snapshot.owner.username === 'string' &&
    typeof snapshot.metadata?.name === 'string' &&
    typeof snapshot.history_generation === 'string' &&
    Number.isSafeInteger(snapshot.revision) &&
    Array.isArray(snapshot.segments) &&
    snapshot.segments.every(
      (segment) =>
        isUuidV7TypedId(segment.segment_id, 'playlist_segment') &&
        typeof segment.rank === 'string' &&
        Array.isArray(segment.entries) &&
        segment.entries.every(
          (entry) =>
            isUuidV7TypedId(entry.entry_id, 'playlist_entry') &&
            typeof entry.rank === 'string' &&
            (entry.track_id === null || typeof entry.track_id === 'string')
        )
    );
  if (!valid) {
    throw new Error('The public playlist response is invalid.');
  }
  return snapshot;
}

export function isFollowedPlaylistHead(value: unknown): value is FollowedPlaylistHead {
  const head = value as FollowedPlaylistHead;
  if (!isUuidV7TypedId(head?.playlist_id, 'playlist')) {
    return false;
  }
  if (head.available === false) {
    return true;
  }
  return (
    head.available === true &&
    isPublicCode(head.public_code) &&
    typeof head.name === 'string' &&
    isUuidV7TypedId(head.owner?.id, 'user') &&
    typeof head.owner.username === 'string' &&
    Number.isSafeInteger(head.revision)
  );
}
