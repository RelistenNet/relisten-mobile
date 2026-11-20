import Realm from 'realm';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { parseUuidTypedId } from '@/relisten/util/typed_uuid_id';

export { trackIdForSourceTrack } from '@/relisten/realm/catalog_track_id';

/**
 * The stored recording for a v4 track ID, or null when this device hasn't
 * stored it, it was deleted, or it was stored without the show, source and
 * artist that playing and displaying it read.
 */
export function storedSourceTrack(realm: Realm, trackId: string): SourceTrack | null {
  const uuid = parseUuidTypedId(trackId, 'track');
  return completeSourceTrack(uuid ? realm.objectForPrimaryKey(SourceTrack, uuid) : null);
}

/** The track if it can be played and displayed: not deleted, with its show, source and artist. */
export function completeSourceTrack(track: SourceTrack | null | undefined): SourceTrack | null {
  return track && track.deletedAt == null && track.show && track.source && track.artist
    ? track
    : null;
}
