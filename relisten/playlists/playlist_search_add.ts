import type Realm from 'realm';
import type { RelistenApiClient } from '@/relisten/api/client';
import type { CatalogResolveResponse } from '@/relisten/api/catalog/resolve';
import { resolveCatalogBatch } from '@/relisten/realm/catalog_resolution';
import {
  Playlist,
  PLAYLIST_DEVICE_STATE_ID,
  PlaylistDeviceState,
  PlaylistTrackAvailability,
} from '@/relisten/realm/models/playlists/playlist';
import { addTracks } from '@/relisten/playlists/playlist_actions';
import { readPlaylistSnapshot } from '@/relisten/playlists/playlist_repository';

/** The catalog says this file can't be added: it is gone, retired or not playable. */
export class TrackUnavailableError extends Error {
  constructor(readonly trackId: string) {
    super('This recording is no longer available.');
    this.name = 'TrackUnavailableError';
  }
}

/**
 * - `added`: the file is at the end of the playlist, with undo recorded.
 * - `duplicate`: it is already on the playlist; ask, then call again with
 *   `allowDuplicate`.
 * - `destination_changed`: the account changed, or the playlist was deleted,
 *   archived or stopped being editable while the check ran. Nothing changed.
 */
export type SearchTrackAddResult = 'added' | 'duplicate' | 'destination_changed';

/**
 * Adds one file from a search result. A search result carries only a
 * `track_` ID, and a copy cached on this device may have been withdrawn
 * upstream since, so the catalog is always asked first, even for a cached
 * track. It fails the same way the server would refuse the add:
 *
 * 1. Resolve and check. `assertAddable` refuses an unavailable, retired or
 *    unplayable file with `TrackUnavailableError` before anything reaches
 *    Realm (the mapper would throw on a track without audio). Missing or
 *    inconsistent data throws an ordinary, retryable error.
 * 2. On a pass, the resolver's write stores the metadata and clears any old
 *    availability marker, which would otherwise outrank it.
 * 3. Recheck the destination and look for a duplicate, then add in a second
 *    write: Realm doesn't allow a write inside another. If the add fails, the
 *    metadata stays cached, which is harmless.
 *
 * No hydration lock is needed: hydration only fetches entries already marked
 * `loading`, and this entry is inserted after its metadata exists.
 */
export async function addSearchTrack(
  realm: Realm,
  catalogApi: RelistenApiClient,
  playlistId: string,
  trackId: string,
  { isCurrent, allowDuplicate = false }: { isCurrent: () => boolean; allowDuplicate?: boolean }
): Promise<SearchTrackAddResult> {
  const resolved = await resolveCatalogBatch(
    realm,
    catalogApi,
    [{ kind: 'track', scheme: 'v4', id: trackId }],
    {
      isCurrent,
      checkBeforeApply: (response) => assertAddable(response, trackId),
      applyAlso: () => clearAvailabilityMarker(realm, trackId),
    }
  );

  if (!resolved || !isCurrent() || !isEditablePlaylist(realm, playlistId)) {
    return 'destination_changed';
  }

  if (!allowDuplicate && playlistHasTrack(realm, playlistId, trackId)) {
    return 'duplicate';
  }

  // `addTracks` reports false when nothing changed, and then records no undo.
  const changed = addTracks(realm, playlistId, [[trackId]]);

  return changed ? 'added' : 'destination_changed';
}

/**
 * Mirrors the server's `PlaylistTrackResolver`: a v4 track ID either resolves
 * to itself or has no target. Anything else is retryable, not a refusal.
 */
function assertAddable(response: CatalogResolveResponse, trackId: string) {
  const [reference] = response.references;
  const track = response.entities.tracks.find((entity) => entity.id === trackId);

  if (
    (reference.availability === 'unavailable' || reference.availability === 'retired') &&
    reference.target === null &&
    !track
  ) {
    throw new TrackUnavailableError(trackId);
  }

  if (
    reference.availability !== 'available' ||
    reference.target?.id !== trackId ||
    typeof track?.playable !== 'boolean'
  ) {
    throw new Error('The catalog returned an inconsistent answer for this track.');
  }

  if (!track.playable) {
    throw new TrackUnavailableError(trackId);
  }
}

function clearAvailabilityMarker(realm: Realm, trackId: string) {
  const marker = realm.objectForPrimaryKey(PlaylistTrackAvailability, trackId);
  if (marker) {
    realm.delete(marker);
  }
}

/**
 * What `useEditablePlaylists` lists: a live playlist this listener owns, in
 * the library of the account this device shows (or on the device only).
 */
function isEditablePlaylist(realm: Realm, playlistId: string) {
  const playlist = realm.objectForPrimaryKey(Playlist, playlistId);
  const visibleUserId =
    realm.objectForPrimaryKey(PlaylistDeviceState, PLAYLIST_DEVICE_STATE_ID)?.lastSignedInUserId ??
    null;

  return (
    !!playlist &&
    !playlist.deletedAt &&
    !playlist.archived &&
    playlist.access === 'owner' &&
    (!playlist.libraryUserId || playlist.libraryUserId === visibleUserId)
  );
}

function playlistHasTrack(realm: Realm, playlistId: string, trackId: string) {
  for (const entry of readPlaylistSnapshot(realm, playlistId).entries.values()) {
    if (entry.trackId === trackId) {
      return true;
    }
  }
  return false;
}
