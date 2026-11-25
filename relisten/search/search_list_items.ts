import type { Artist } from '@/relisten/realm/models/artist';
import type { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import type { Show } from '@/relisten/realm/models/show';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import type { LocalSearchResults } from './search_local';
import type { SearchPresentation } from './search_presentation';
import type { SearchCatalogRow, SearchPlaylistCard, SearchScope } from './search_types';

/**
 * One line of a search results list. Both surfaces render the same items and
 * differ only in what a tap does and what sits at the end of a row.
 */
export type SearchListItem =
  | { type: 'header'; key: string; title: string; scope?: SearchScope }
  | { type: 'row'; key: string; row: SearchCatalogRow }
  | { type: 'playlist'; key: string; card: SearchPlaylistCard }
  | { type: 'message'; key: string; text: string; retry?: boolean }
  | { type: 'loading'; key: string }
  | { type: 'local-artist'; key: string; artist: Artist }
  | { type: 'local-show'; key: string; show: Show }
  | { type: 'local-track'; key: string; track: SourceTrack }
  | { type: 'local-playlist'; key: string; playlist: Playlist }
  | { type: 'recent'; key: string; entry: PlaybackHistoryEntry };

/** Render the ranked server rows in their original order. */
export function buildRemoteListItems(
  presentation: SearchPresentation,
  scope: SearchScope,
  query: string
): SearchListItem[] {
  const { catalog, playlists, rows } = presentation;
  const items: SearchListItem[] = rows.map((row) =>
    row.kind === 'playlist'
      ? { type: 'playlist', key: row.key, card: row.playlist }
      : { type: 'row', key: row.key, row }
  );

  // All shows a sample; each header links to a tab with more than it showed.
  for (const moreScope of presentation.moreScopes ?? []) {
    items.push({
      type: 'header',
      key: `more:${moreScope}`,
      title: `More ${moreScope}`,
      scope: moreScope,
    });
  }

  if (playlists.kind === 'unavailable') {
    items.push({
      type: 'message',
      key: 'playlists-unavailable',
      text: 'Playlists couldn’t load.',
      retry: true,
    });
  }

  // Still waiting: the first answer hasn't arrived, or the Playlists scope has
  // more pages whose cards may show even though this one showed none.
  const waiting =
    catalog.kind === 'waiting' ||
    playlists.kind === 'waiting' ||
    (scope !== 'all' &&
      (presentation.hasMore || (playlists.kind === 'available' && playlists.hasMore)));
  const hasResults = items.some((item) => item.type === 'row' || item.type === 'playlist');

  if (waiting && !hasResults) {
    items.push({ type: 'loading', key: 'loading' });
  } else if (!waiting && !hasResults && isAnswered(presentation)) {
    items.push({
      type: 'message',
      key: 'empty',
      text: `No results for “${query.trim()}”.`,
    });
  }

  return items;
}

/** Both halves gave a real answer, so an empty list really means no results. */
function isAnswered({ catalog, playlists }: SearchPresentation) {
  const catalogAnswered = catalog.kind === 'remote' || catalog.kind === 'none';
  const playlistsAnswered = playlists.kind === 'available' || playlists.kind === 'none';
  return catalogAnswered && playlistsAnswered;
}

/**
 * On this device, under its own header. `retryable` explains that the catalog
 * couldn't be reached while online, and offers to try again.
 */
export function buildLocalListItems(
  results: LocalSearchResults,
  { retryable, query }: { retryable: boolean; query: string }
): SearchListItem[] {
  const items: SearchListItem[] = [
    { type: 'header', key: 'header:local', title: 'On This Device' },
  ];

  if (retryable) {
    items.push({
      type: 'message',
      key: 'catalog-unavailable',
      text: 'Couldn’t reach the catalog. Showing what’s downloaded.',
      retry: true,
    });
  }

  for (const artist of results.artists) {
    items.push({
      type: 'local-artist',
      key: `local-artist:${artist.uuid}`,
      artist,
    });
  }
  for (const show of results.shows) {
    items.push({ type: 'local-show', key: `local-show:${show.uuid}`, show });
  }
  for (const track of results.tracks) {
    items.push({
      type: 'local-track',
      key: `local-track:${track.uuid}`,
      track,
    });
  }
  for (const playlist of results.playlists) {
    items.push({
      type: 'local-playlist',
      key: `local-playlist:${playlist.playlistId}`,
      playlist,
    });
  }

  const found =
    results.artists.length +
    results.shows.length +
    results.tracks.length +
    results.playlists.length;
  if (found === 0 && query.trim()) {
    items.push({
      type: 'message',
      key: 'local-empty',
      text: `Nothing downloaded matches “${query.trim()}”.`,
    });
  }

  return items;
}

export function buildRecentListItems(
  entries: readonly PlaybackHistoryEntry[],
  emptyHint: string
): SearchListItem[] {
  if (entries.length === 0) {
    return [{ type: 'message', key: 'recent-empty', text: emptyHint }];
  }

  return [
    { type: 'header', key: 'header:recent', title: 'Recently Played' },
    ...entries.map(
      (entry): SearchListItem => ({
        type: 'recent',
        key: `recent:${entry.show.uuid}`,
        entry,
      })
    ),
  ];
}
