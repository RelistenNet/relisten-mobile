import type { Href } from 'expo-router';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { RelistenTabGroupSegment } from '@/relisten/util/routes';
import type { SearchCatalogRow, SearchPlaylistCard } from './search_types';

/**
 * A shared venue (`venue_…`) spans artists and has its own page; an imported
 * venue belongs to one artist and opens under it.
 */
const isSharedVenue = (venueId: string) => venueId.startsWith('venue_');

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
  if (row.kind === 'venue' && isSharedVenue(row.venue.id)) {
    return {
      kind: 'push',
      href: {
        pathname: `/relisten/tabs/${tab}/venue/[venueId]/` as const,
        params: { venueId: row.venue.id },
      },
    };
  }
  if (!artist) {
    throw new Error(`A ${row.kind} result needs its artist.`);
  }

  const artistUuid = artist.uuid;
  const push = (href: Href): SearchTapTarget => ({ kind: 'push', href });
  const source = (showId: string, sourceId: string, focusTrackId?: string) =>
    push(
      sourceHref(
        tab,
        {
          artistUuid,
          showUuid: decodeUuidCatalogId(showId, 'show'),
          sourceUuid: decodeUuidCatalogId(sourceId, 'source'),
        },
        {
          exact: true,
          focusTrackUuid: focusTrackId ? decodeUuidCatalogId(focusTrackId, 'track') : undefined,
        }
      )
    );

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
        params: { artistUuid, songUuid: row.song.id },
      });
    case 'venue':
      return push({
        pathname: `/relisten/tabs/${tab}/[artistUuid]/venue/[venueUuid]/` as const,
        params: {
          artistUuid,
          venueUuid: decodeUuidCatalogId(row.venue.id, 'imported_venue'),
          venueKind: 'imported_venue',
        },
      });
    case 'tour':
      return push({
        pathname: `/relisten/tabs/${tab}/[artistUuid]/tour/[tourUuid]/` as const,
        params: { artistUuid, tourUuid: decodeUuidCatalogId(row.tour.id, 'tour') },
      });
    case 'show':
      return row.source
        ? source(row.show.id, row.source.id)
        : { kind: 'show', showUuid: decodeUuidCatalogId(row.show.id, 'show') };
    case 'performance': {
      const track = row.preview_track;
      return source(track.show_id, track.source_id, track.id);
    }
    case 'sequence':
      return source(row.show.id, row.passage.source_id, row.passage.tracks[0]?.id);
    case 'recording':
    case 'review':
      return source(row.show.id, row.source.id);
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

/**
 * A source page in a tab. `exact` opens that recording even when the
 * listener's source settings would prefer another; `focusTrackUuid` scrolls
 * to a file and highlights it without playing it.
 */
export function sourceHref(
  tab: RelistenTabGroupSegment,
  ids: { artistUuid: string; showUuid: string; sourceUuid: string },
  { exact = false, focusTrackUuid }: { exact?: boolean; focusTrackUuid?: string } = {}
): Href {
  return {
    pathname: `/relisten/tabs/${tab}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/` as const,
    params: {
      ...ids,
      ...(exact ? { exactSource: '1' } : {}),
      ...(focusTrackUuid ? { focusTrackUuid } : {}),
    },
  };
}

/** A downloaded file from On this device, at its source, focused and not played. */
export function localTrackHref(
  track: { artistUuid: string; showUuid: string; sourceUuid: string; uuid: string },
  tab: RelistenTabGroupSegment
): Href {
  const { artistUuid, showUuid, sourceUuid } = track;
  return sourceHref(tab, { artistUuid, showUuid, sourceUuid }, { focusTrackUuid: track.uuid });
}

export function localPlaylistHref(playlistId: string, tab: RelistenTabGroupSegment): Href {
  return {
    pathname: `/relisten/tabs/${tab}/playlists/[playlistId]` as const,
    params: { playlistId },
  };
}
