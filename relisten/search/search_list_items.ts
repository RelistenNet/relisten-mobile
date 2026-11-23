import type { Artist } from '@/relisten/realm/models/artist';
import type { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import type { Show } from '@/relisten/realm/models/show';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import type { LocalSearchResults } from './search_local';
import type { SearchPresentation } from './search_presentation';
import { searchRowKey } from './search_rows';
import type { SearchCatalogRow, SearchPlaylistCard, SearchScope } from './search_types';

/** How many playlist cards the All scope shows before its header links to the rest. */
export const ALL_SCOPE_PLAYLIST_LIMIT = 6;

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

/**
 * The remote half of a results list: the catalog in rank order, then the
 * sections the All scope adds, then playlist cards. The All scope's other
 * `sections` arrays repeat rows already in `top`, so only sources, reviews
 * and passages are rendered from them. Local (On this device) and Recently
 * Played items come from the screen, not from here.
 */
export function buildRemoteListItems(
  presentation: SearchPresentation,
  scope: SearchScope,
  query: string
): SearchListItem[] {
  const items: SearchListItem[] = [];
  const { catalog, playlists } = presentation;

  if (catalog.kind === 'remote') {
    const body = catalog.catalog;
    if (scope === 'all') {
      pushRows(items, body.top ?? []);
      pushSection(items, 'Sources', 'sources', body.sections?.sources);
      pushSection(items, 'Reviews', 'reviews', body.sections?.reviews);
      // Passages have no scope of their own, so their header doesn't link.
      pushSection(items, 'Passages', undefined, body.sections?.passages);
    } else {
      pushRows(items, body.results ?? []);
    }
  }

  if (playlists.kind === 'cards' && playlists.cards.length > 0) {
    const cards =
      scope === 'all' ? playlists.cards.slice(0, ALL_SCOPE_PLAYLIST_LIMIT) : playlists.cards;
    if (scope === 'all') {
      items.push({
        type: 'header',
        key: 'header:playlists',
        title: 'Playlists',
        scope: 'playlists',
      });
    }
    for (const card of cards) {
      items.push({ type: 'playlist', key: `playlist:${card.id}`, card });
    }
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
    (scope === 'playlists' && playlists.kind === 'cards' && playlists.hasMore);
  const hasResults = items.some((item) => item.type === 'row' || item.type === 'playlist');

  if (waiting && !hasResults) {
    items.push({ type: 'loading', key: 'loading' });
  } else if (!waiting && !hasResults && isAnswered(presentation)) {
    items.push({ type: 'message', key: 'empty', text: `No results for “${query.trim()}”.` });
  }

  return items;
}

/** Both halves gave a real answer, so an empty list really means no results. */
function isAnswered({ catalog, playlists }: SearchPresentation) {
  const catalogAnswered = catalog.kind === 'remote' || catalog.kind === 'none';
  const playlistsAnswered = playlists.kind === 'cards' || playlists.kind === 'none';
  return catalogAnswered && playlistsAnswered;
}

function pushRows(items: SearchListItem[], rows: SearchCatalogRow[]) {
  const seen = new Set(items.map((item) => item.key));
  for (const row of rows) {
    const key = searchRowKey(row);
    if (!seen.has(key)) {
      seen.add(key);
      items.push({ type: 'row', key, row });
    }
  }
}

function pushSection(
  items: SearchListItem[],
  title: string,
  scope: SearchScope | undefined,
  rows: SearchCatalogRow[] | undefined
) {
  if (!rows?.length) {
    return;
  }
  // Section rows can repeat rows already in `top`; a header with nothing new under it is dropped.
  const header: SearchListItem = { type: 'header', key: `header:${title}`, title, scope };
  const before = items.length;
  items.push(header);
  pushRows(items, rows);
  if (items.length === before + 1) {
    items.pop();
  }
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
    items.push({ type: 'local-artist', key: `local-artist:${artist.uuid}`, artist });
  }
  for (const show of results.shows) {
    items.push({ type: 'local-show', key: `local-show:${show.uuid}`, show });
  }
  for (const track of results.tracks) {
    items.push({ type: 'local-track', key: `local-track:${track.uuid}`, track });
  }
  for (const playlist of results.playlists) {
    items.push({ type: 'local-playlist', key: `local-playlist:${playlist.playlistId}`, playlist });
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
      (entry): SearchListItem => ({ type: 'recent', key: `recent:${entry.show.uuid}`, entry })
    ),
  ];
}
