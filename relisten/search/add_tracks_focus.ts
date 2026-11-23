import { songsOf } from '@/relisten/player/ui/track_songs';
import type { SourceTrack } from '@/relisten/realm/models/source_track';

/**
 * What an Add Tracks setlist highlights. A search result names either an
 * exact file (a performance's preview, a passage's first file) or a song. A
 * song highlights every file on this source whose normalized title includes
 * it, so July 25, 2017 shows both `Lawn Boy` files, Set 1 and Encore, and
 * another recording of the same show highlights its own copy.
 */
export interface AddTracksFocus {
  trackUuid?: string;
  /** A `song_` ID, or an imported song's `normalizedSongId`. */
  songId?: string;
}

export function focusedTrackUuids(
  tracks: Iterable<Pick<SourceTrack, 'uuid' | 'normalization'>>,
  focus: AddTracksFocus
): Set<string> {
  const focused = new Set<string>();

  for (const track of tracks) {
    if (track.uuid === focus.trackUuid) {
      focused.add(track.uuid);
    } else if (focus.songId && songsOf(track).some((song) => song.id === focus.songId)) {
      focused.add(track.uuid);
    }
  }

  return focused;
}
