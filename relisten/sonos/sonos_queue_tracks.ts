import Realm from 'realm';
import type { RelistenApiClient } from '@/relisten/api/client';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  MAX_REFERENCES_PER_REQUEST,
  resolveCatalogBatch,
} from '@/relisten/realm/catalog_resolution';
import { storedSourceTrack, trackIdForSourceTrack } from '@/relisten/realm/source_track_lookup';
import type { SonosQueueEntry } from './sonos_playback';

/**
 * The phone's queue for a room's order:
 * - `built`: one entry per occurrence, in the room's order.
 * - `unavailable`: the catalog says these occurrences' recordings are gone
 *   (taken down or retired), so the phone can't show them.
 * - `unreachable`: a catalog lookup failed; asking again later may work.
 */
export type RoomQueueTracks =
  | { kind: 'built'; tracks: PlayerQueueTrack[] }
  | { kind: 'unavailable'; occurrenceIds: string[] }
  | { kind: 'unreachable' };

/**
 * Phone queue entries for a room's order, each keeping the room's occurrence
 * ID as its identifier. An occurrence the phone already holds keeps its entry
 * (and its playlist context). One added on another device is built from the
 * stored recording, and the catalog is asked about any recording this device
 * hasn't stored completely. The phone never shows a queue that differs from
 * the room's, so anything missing means no queue is built.
 */
export async function queueTracksForRoom(
  realm: Realm,
  catalogApi: RelistenApiClient,
  entries: readonly SonosQueueEntry[],
  phoneTracks: readonly PlayerQueueTrack[]
): Promise<RoomQueueTracks> {
  const phoneTrackById = new Map(phoneTracks.map((track) => [track.identifier, track]));
  // The phone's own entry for an occurrence, unless that ID now names another recording.
  const phoneTrackFor = (entry: SonosQueueEntry) => {
    const track = phoneTrackById.get(entry.occurrenceId);
    return track && trackIdForSourceTrack(track.sourceTrack) === entry.trackId ? track : undefined;
  };

  const missing = entries.filter(
    (entry) => !phoneTrackFor(entry) && !storedSourceTrack(realm, entry.trackId)
  );
  const lookup = await storeMissingRecordings(realm, catalogApi, missing);
  if (lookup.kind === 'unreachable') {
    return lookup;
  }
  const unavailable = entries.filter((entry) => lookup.gone.has(entry.trackId));
  if (unavailable.length > 0) {
    return { kind: 'unavailable', occurrenceIds: unavailable.map((entry) => entry.occurrenceId) };
  }

  const tracks: PlayerQueueTrack[] = [];
  for (const entry of entries) {
    const existing = phoneTrackFor(entry);
    const sourceTrack = existing ? undefined : storedSourceTrack(realm, entry.trackId);
    if (existing) {
      tracks.push(existing);
    } else if (sourceTrack) {
      const track = PlayerQueueTrack.fromSourceTrack(sourceTrack, entry.occurrenceId);
      if (entry.playlistId && entry.playlistEntryId) {
        track.playlistContext = {
          playlistId: entry.playlistId,
          entryId: entry.playlistEntryId,
          // The room carries attribution. The original phone's shuffle groups are local.
          segmentInstanceId: entry.occurrenceId,
        };
      }
      tracks.push(track);
    } else {
      // The catalog answered but the recording still isn't stored completely.
      return { kind: 'unreachable' };
    }
  }
  return { kind: 'built', tracks };
}

/**
 * Asks the catalog about recordings this device hasn't stored, in
 * resolver-sized batches, and stores what it returns. Stops at the first
 * failed batch, since the queue can't be built without every recording.
 */
async function storeMissingRecordings(
  realm: Realm,
  catalogApi: RelistenApiClient,
  entries: readonly SonosQueueEntry[]
): Promise<{ kind: 'stored'; gone: Set<string> } | { kind: 'unreachable' }> {
  const trackIds = [...new Set(entries.map((entry) => entry.trackId))];
  const gone = new Set<string>();

  for (let offset = 0; offset < trackIds.length; offset += MAX_REFERENCES_PER_REQUEST) {
    const batch = trackIds
      .slice(offset, offset + MAX_REFERENCES_PER_REQUEST)
      .map((id) => ({ kind: 'track' as const, id, scheme: 'v4' as const }));
    try {
      const references = (await resolveCatalogBatch(realm, catalogApi, batch)) ?? [];
      for (const reference of references) {
        if (reference.availability === 'unavailable' || reference.availability === 'retired') {
          gone.add(reference.id);
        }
      }
    } catch {
      return { kind: 'unreachable' };
    }
  }
  return { kind: 'stored', gone };
}
