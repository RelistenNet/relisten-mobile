import Realm from 'realm';
import type { RelistenApiClient } from '@/relisten/api/client';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  MAX_REFERENCES_PER_REQUEST,
  resolveCatalogBatch,
} from '@/relisten/realm/catalog_resolution';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { formatUuidTypedId, parseUuidTypedId } from '@/relisten/util/typed_uuid_id';
import type { SonosQueueEntry } from './sonos_playback';

/**
 * Phone queue entries for a room's order, each keeping the room's occurrence
 * ID as its identifier. An occurrence the phone already holds keeps its entry
 * (and its playlist context); one added on another device is built from the
 * catalog, which is asked about any recording this device hasn't stored.
 * Returns undefined if any recording can't be found, so the phone never
 * shows a queue that differs from the room's.
 */
export async function queueTracksForRoom(
  realm: Realm,
  catalogApi: RelistenApiClient,
  entries: readonly SonosQueueEntry[],
  phoneTracks: readonly PlayerQueueTrack[]
): Promise<PlayerQueueTrack[] | undefined> {
  const phoneTrackById = new Map(phoneTracks.map((track) => [track.identifier, track]));
  // The phone's own entry for an occurrence, unless that ID now names another recording.
  const phoneTrack = (entry: SonosQueueEntry) => {
    const track = phoneTrackById.get(entry.occurrenceId);
    return track && formatUuidTypedId('track', track.sourceTrack.uuid) === entry.trackId
      ? track
      : undefined;
  };

  const added = entries.filter((entry) => !phoneTrack(entry));
  await storeMissingRecordings(realm, catalogApi, added);

  const tracks: PlayerQueueTrack[] = [];
  for (const entry of entries) {
    const existing = phoneTrack(entry);
    if (existing) {
      tracks.push(existing);
      continue;
    }

    const sourceTrack = storedRecording(realm, entry);
    if (!sourceTrack) {
      return undefined;
    }
    const track = PlayerQueueTrack.fromSourceTrack(sourceTrack);
    track.identifier = entry.occurrenceId;
    tracks.push(track);
  }
  return tracks;
}

/** Asks the catalog about recordings this device hasn't stored, in resolver-sized batches. */
async function storeMissingRecordings(
  realm: Realm,
  catalogApi: RelistenApiClient,
  entries: readonly SonosQueueEntry[]
) {
  const missing = [
    ...new Set(
      entries.filter((entry) => !storedRecording(realm, entry)).map((entry) => entry.trackId)
    ),
  ];

  for (let offset = 0; offset < missing.length; offset += MAX_REFERENCES_PER_REQUEST) {
    const batch = missing
      .slice(offset, offset + MAX_REFERENCES_PER_REQUEST)
      .map((id) => ({ kind: 'track' as const, id, scheme: 'v4' as const }));
    // A batch that fails leaves its recordings missing, and the room's queue isn't adopted.
    await resolveCatalogBatch(realm, catalogApi, batch).catch(() => undefined);
  }
}

function storedRecording(realm: Realm, entry: SonosQueueEntry): SourceTrack | null {
  const uuid = parseUuidTypedId(entry.trackId, 'track');
  return uuid ? realm.objectForPrimaryKey(SourceTrack, uuid) : null;
}
