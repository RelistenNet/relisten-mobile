import type { Href } from 'expo-router';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { SearchCatalogRow } from './search_types';

/** The sheet's own screens, pushed inside its stack. */
const SHEET = '/relisten/add-tracks' as const;

/**
 * What an Add Tracks tap does. The sheet never leaves for the app's full
 * screens on a tap (Open full page does that); instead it:
 * - narrows the search in place, for an artist or tour;
 * - opens one of its own screens: a venue's or song's shows, or a setlist
 *   with **+** on every file.
 * A performance's **+** adds its file directly and isn't a tap target.
 */
export type AddTracksTapTarget =
  | { kind: 'narrow-artist'; artistId: string; label: string }
  | { kind: 'narrow-tour'; label: string; artistId: string; artistLabel: string }
  | { kind: 'push'; href: Href };

/** The sheet's setlist screen picks the listener's preferred recording for this source ID. */
export const INITIAL_SOURCE = 'initial';

/** Which files a setlist highlights: one file, every file of a song, or both. */
interface SetlistFocus {
  focusTrackUuid?: string;
  focusSongId?: string;
}

/** The sheet's setlist screen, with **+** on every file. */
export function addTracksSourceHref(
  playlistId: string,
  { showUuid, sourceUuid, ...focus }: { showUuid: string; sourceUuid: string } & SetlistFocus
): Href {
  return {
    pathname: `${SHEET}/source`,
    params: {
      playlistId,
      showUuid,
      sourceUuid,
      ...(focus.focusTrackUuid ? { focusTrackUuid: focus.focusTrackUuid } : {}),
      ...(focus.focusSongId ? { focusSongId: focus.focusSongId } : {}),
    },
  } as Href;
}

export function addTracksTapTarget(row: SearchCatalogRow, playlistId: string): AddTracksTapTarget {
  const push = (pathname: string, params: Record<string, string>): AddTracksTapTarget => ({
    kind: 'push',
    href: { pathname, params: { playlistId, ...params } } as Href,
  });
  // The listener's source settings choose the recording when a row names none.
  const setlist = (showId: string, sourceId: string | undefined, focus: SetlistFocus = {}) => ({
    kind: 'push' as const,
    href: addTracksSourceHref(playlistId, {
      showUuid: decodeUuidCatalogId(showId, 'show'),
      sourceUuid: sourceId ? decodeUuidCatalogId(sourceId, 'source') : INITIAL_SOURCE,
      ...focus,
    }),
  });

  switch (row.kind) {
    case 'artist':
      return { kind: 'narrow-artist', artistId: row.artist.id, label: row.artist.name };
    case 'tour':
      return {
        kind: 'narrow-tour',
        label: row.tour.name,
        artistId: row.artist.id,
        artistLabel: row.artist.name,
      };
    case 'song':
      return push(`${SHEET}/shows`, {
        kind: 'song',
        artistUuid: decodeUuidCatalogId(row.artist.id, 'artist'),
        songId: row.song.id,
      });
    case 'venue':
      return push(`${SHEET}/shows`, {
        kind: 'venue',
        venueId: row.venue.id,
        ...('artist_id' in row.venue
          ? { artistUuid: decodeUuidCatalogId(row.venue.artist_id, 'artist') }
          : {}),
      });
    case 'show':
      return setlist(row.show.id, row.source?.id);
    case 'performance': {
      const track = row.preview_track;
      // Focus the exact file and any other files of the matched song.
      return setlist(track.show_id, track.source_id, {
        focusTrackUuid: decodeUuidCatalogId(track.id, 'track'),
        ...(row.performance ? { focusSongId: row.performance.song_id } : {}),
      });
    }
    case 'sequence': {
      const firstTrack = row.passage.tracks[0];
      return setlist(
        row.show.id,
        row.passage.source_id,
        firstTrack ? { focusTrackUuid: decodeUuidCatalogId(firstTrack.id, 'track') } : {}
      );
    }
    case 'recording':
    case 'review':
      return setlist(row.show.id, row.source.id);
  }
}

/** The file a row's **+** adds: a performance's preview. Other rows add from a setlist. */
export function addableTrack(row: SearchCatalogRow): { trackId: string; title: string } | null {
  if (row.kind !== 'performance' || row.preview_track.playable === false) {
    return null;
  }
  return { trackId: row.preview_track.id, title: row.preview_track.title };
}
