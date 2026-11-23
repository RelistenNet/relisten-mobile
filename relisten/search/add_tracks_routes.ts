import type { Href } from 'expo-router';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { isSharedVenue } from './search_routes';
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
  | { kind: 'narrow-tour'; label: string; artistId?: string; artistLabel: string }
  | { kind: 'push'; href: Href };

export function addTracksTapTarget(row: SearchCatalogRow, playlistId: string): AddTracksTapTarget {
  const push = (pathname: string, params: Record<string, string>): AddTracksTapTarget => ({
    kind: 'push',
    href: { pathname, params: { playlistId, ...params } } as Href,
  });
  const setlist = (
    showId: string,
    sourceId: string | 'initial',
    focus: Record<string, string> = {}
  ) =>
    push(`${SHEET}/source`, {
      showUuid: decodeUuidCatalogId(showId, 'show'),
      sourceUuid: sourceId === 'initial' ? 'initial' : decodeUuidCatalogId(sourceId, 'source'),
      ...focus,
    });

  switch (row.kind) {
    case 'artist':
      return { kind: 'narrow-artist', artistId: row.id, label: row.label };
    case 'tour':
      return {
        kind: 'narrow-tour',
        label: row.label,
        artistId: row.artist_id,
        artistLabel: row.artist_label,
      };
    case 'song':
      return push(`${SHEET}/shows`, {
        kind: 'song',
        artistUuid: decodeUuidCatalogId(row.artist_id!, 'artist'),
        songId: row.id,
      });
    case 'venue':
      return push(`${SHEET}/shows`, {
        kind: 'venue',
        venueId: row.venue_id,
        ...(isSharedVenue(row.venue_id) || !row.artist_id
          ? {}
          : { artistUuid: decodeUuidCatalogId(row.artist_id, 'artist') }),
      });
    case 'show':
      return setlist(row.show_id, 'initial');
    case 'performance':
      // The setlist highlights every file of the song, so a short encore
      // reprise shows next to the long set file the row names.
      return setlist(row.show_id, row.preview.source_id, {
        focusTrackUuid: decodeUuidCatalogId(row.preview.track_id, 'track'),
        ...(row.song_id ? { focusSongId: row.song_id } : {}),
      });
    case 'recording':
      return setlist(row.show_id, row.id);
    case 'sequence':
      return setlist(row.show_id, row.source_id, {
        focusTrackUuid: decodeUuidCatalogId(row.track_ids[0], 'track'),
      });
    case 'review':
      return setlist(row.show_id, row.source_id);
  }
}

/** The file a row's **+** adds: a performance's preview. Other rows add from a setlist. */
export function addableTrack(row: SearchCatalogRow): { trackId: string; title: string } | null {
  if (row.kind !== 'performance') {
    return null;
  }
  return { trackId: row.preview.track_id, title: row.preview.label || row.label };
}
