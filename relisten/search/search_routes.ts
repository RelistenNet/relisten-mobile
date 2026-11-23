import type { Href } from 'expo-router';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { RelistenTabGroupSegment } from '@/relisten/util/routes';
import type { SearchCatalogRow, SearchPlaylistCard } from './search_types';

/**
 * How to find a row's artist, or null when the tap doesn't need one (a shared
 * venue page lists every artist's shows). Recording, review and passage rows
 * carry only the slug; the rest carry the `artist_` ID.
 */
export type SearchArtistRef = { uuid: string } | { slug: string };

export function searchArtistRef(row: SearchCatalogRow): SearchArtistRef | null {
  if (row.kind === 'artist') {
    return { uuid: decodeUuidCatalogId(row.id, 'artist') };
  }
  if (row.kind === 'venue' && isSharedVenue(row.venue_id)) {
    return null;
  }
  if (row.kind !== 'sequence' && row.artist_id) {
    return { uuid: decodeUuidCatalogId(row.artist_id, 'artist') };
  }
  return { slug: row.artist_slug };
}

/**
 * A shared venue (`venue_…`) spans artists and has its own page; an imported
 * venue belongs to one artist and opens under it.
 */
export const isSharedVenue = (venueId: string) => venueId.startsWith('venue_');

/**
 * Where a Search-tab tap goes, once the row's artist is loaded:
 * - `push`: a screen in the Search stack;
 * - `show`: a show without a named source, which opens through `pushShow`
 *   so the listener's source settings choose the recording.
 * A row that names a source or file opens exactly that one; the file is
 * focused, never played.
 */
export type SearchTapTarget = { kind: 'push'; href: Href } | { kind: 'show'; showUuid: string };

export function searchTapTarget(
  row: SearchCatalogRow,
  artist: { uuid: string } | null,
  tab: RelistenTabGroupSegment
): SearchTapTarget {
  if (row.kind === 'venue' && isSharedVenue(row.venue_id)) {
    return {
      kind: 'push',
      href: {
        pathname: `/relisten/tabs/${tab}/venue/[venueId]/` as const,
        params: { venueId: row.venue_id },
      },
    };
  }
  if (!artist) {
    throw new Error(`A ${row.kind} result needs its artist.`);
  }

  const artistUuid = artist.uuid;
  const push = (href: Href): SearchTapTarget => ({ kind: 'push', href });
  const source = (showId: string, sourceId: string, focusTrackId?: string) =>
    push({
      pathname: `/relisten/tabs/${tab}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/` as const,
      params: {
        artistUuid,
        showUuid: decodeUuidCatalogId(showId, 'show'),
        sourceUuid: decodeUuidCatalogId(sourceId, 'source'),
        exactSource: '1',
        ...(focusTrackId ? { focusTrackUuid: decodeUuidCatalogId(focusTrackId, 'track') } : {}),
      },
    });

  switch (row.kind) {
    case 'artist':
      return push({
        pathname: `/relisten/tabs/${tab}/[artistUuid]/` as const,
        params: { artistUuid },
      });
    case 'song':
      // The song page takes `song_` and `imported_song_` IDs as they are.
      return push({
        pathname: `/relisten/tabs/${tab}/[artistUuid]/song/[songUuid]/` as const,
        params: { artistUuid, songUuid: row.id },
      });
    case 'venue':
      return push({
        pathname: `/relisten/tabs/${tab}/[artistUuid]/venue/[venueUuid]/` as const,
        params: {
          artistUuid,
          venueUuid: decodeUuidCatalogId(row.venue_id, 'imported_venue'),
          venueKind: 'imported_venue',
        },
      });
    case 'tour':
      return push({
        pathname: `/relisten/tabs/${tab}/[artistUuid]/tour/[tourUuid]/` as const,
        params: { artistUuid, tourUuid: decodeUuidCatalogId(row.id, 'tour') },
      });
    case 'show':
      return { kind: 'show', showUuid: decodeUuidCatalogId(row.show_id, 'show') };
    case 'performance':
      return source(row.show_id, row.preview.source_id, row.preview.track_id);
    case 'recording':
      return source(row.show_id, row.id);
    case 'sequence':
      return source(row.show_id, row.source_id, row.track_ids[0]);
    case 'review':
      // The reviewed recording's page, which has the show and its Reviews button.
      return source(row.show_id, row.source_id);
  }
}

/** A playlist with a visible row on this device opens there; otherwise by public code. */
export function playlistCardHref(
  card: SearchPlaylistCard,
  hasLocalPlaylist: boolean,
  tab: RelistenTabGroupSegment
): Href | undefined {
  if (hasLocalPlaylist) {
    return localPlaylistHref(card.id, tab);
  }
  if (card.public_code) {
    return {
      pathname: `/relisten/tabs/${tab}/playlists/shared/[publicCode]` as const,
      params: { publicCode: card.public_code },
    };
  }
  return undefined;
}

/** A downloaded file from On this device, at its source, focused and not played. */
export function localTrackHref(
  track: { artistUuid: string; showUuid: string; sourceUuid: string; uuid: string },
  tab: RelistenTabGroupSegment
): Href {
  return {
    pathname: `/relisten/tabs/${tab}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/` as const,
    params: {
      artistUuid: track.artistUuid,
      showUuid: track.showUuid,
      sourceUuid: track.sourceUuid,
      focusTrackUuid: track.uuid,
    },
  };
}

export function localPlaylistHref(playlistId: string, tab: RelistenTabGroupSegment): Href {
  return {
    pathname: `/relisten/tabs/${tab}/playlists/[playlistId]` as const,
    params: { playlistId },
  };
}
