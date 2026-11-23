import type { SearchSessionState } from './search_session';
import type {
  SearchAvailability,
  SearchCatalogBody,
  SearchInterpretationChip,
  SearchMode,
  SearchPlaylistCard,
  SearchResponse,
} from './search_types';

/**
 * What the catalog half of the screen shows:
 * - `recent`: the field is empty, so Recently Played;
 * - `remote`: the server's catalog results, which may be empty;
 * - `local`: On this device, because the app is offline, the request failed
 *   or the server reported the catalog unavailable;
 * - `waiting`: no answer yet for the current scope;
 * - `none`: the scope (Playlists) doesn't search the catalog.
 */
export type CatalogPresentation =
  | { kind: 'recent' }
  | { kind: 'waiting' }
  | { kind: 'none' }
  | { kind: 'remote'; catalog: SearchCatalogBody }
  | { kind: 'local'; retryable: boolean };

/**
 * What the playlists half shows. `unavailable` draws a retry in its place,
 * never "No results"; `none` means this search doesn't include playlists.
 */
export type PlaylistPresentation =
  | { kind: 'none' }
  | { kind: 'waiting' }
  | { kind: 'unavailable' }
  /** `hasMore`: later pages may still have cards, even when this one showed none. */
  | { kind: 'cards'; cards: SearchPlaylistCard[]; hasMore: boolean };

export interface SearchPresentation {
  catalog: CatalogPresentation;
  playlists: PlaylistPresentation;
}

export interface PresentSearchOptions {
  online: boolean;
  mode: SearchMode;
  /** Whether this device has a visible row for the playlist. */
  hasLocalPlaylist: (playlistId: string) => boolean;
}

/**
 * Decides what each half of a search screen shows. The halves fail
 * independently: an unavailable catalog falls back to On this device while
 * healthy playlist results stay, and a successful empty answer stays empty.
 *
 * While the listener types, the previous answer stays on screen until the
 * next one replaces it. An answer for another scope is not shown, because its
 * rows belong to a different list. A failed request always wins over the
 * previous answer, so stale results never stand in for the current query.
 */
export function presentSearch(
  state: SearchSessionState,
  { online, mode, hasLocalPlaylist }: PresentSearchOptions
): SearchPresentation {
  const { inputs, response, responseInputs } = state;
  const wantsCatalog = inputs.scope !== 'playlists';
  const wantsPlaylists =
    mode === 'explore' && (inputs.scope === 'all' || inputs.scope === 'playlists');
  const catalogOr = (catalog: CatalogPresentation): CatalogPresentation =>
    wantsCatalog ? catalog : { kind: 'none' };
  const playlistsOr = (playlists: PlaylistPresentation): PlaylistPresentation =>
    wantsPlaylists ? playlists : { kind: 'none' };

  if (!inputs.query.trim()) {
    return { catalog: { kind: 'recent' }, playlists: { kind: 'none' } };
  }
  // Offline, On this device covers every scope, local playlists included.
  if (!online) {
    return { catalog: { kind: 'local', retryable: false }, playlists: { kind: 'none' } };
  }
  if (state.failed) {
    return {
      catalog: catalogOr({ kind: 'local', retryable: true }),
      playlists: playlistsOr({ kind: 'unavailable' }),
    };
  }
  if (!response || responseInputs?.scope !== inputs.scope) {
    return { catalog: catalogOr({ kind: 'waiting' }), playlists: playlistsOr({ kind: 'waiting' }) };
  }

  return {
    catalog: catalogOr(presentCatalog(response.catalog_availability, response.catalog)),
    playlists: playlistsOr(presentPlaylists(response, hasLocalPlaylist)),
  };
}

/**
 * The chips above the results: the clues the server read, minus any the
 * listener removed (the previous answer may still carry one), plus an
 * explicit artist filter. Removing a chip goes through `SearchSession.removeChip`.
 */
export function visibleChips(state: SearchSessionState): SearchInterpretationChip[] {
  const { inputs, response } = state;
  const read = (response?.catalog?.interpretation.chips ?? []).filter(
    (chip) =>
      !inputs.removedChipKeys.includes(chip.key) && !(chip.key === 'artist' && inputs.artistFilter)
  );

  if (!inputs.artistFilter) {
    return read;
  }
  const { artistId, label } = inputs.artistFilter;
  return [{ key: 'artist', label, value: artistId }, ...read];
}

function presentCatalog(
  availability: SearchAvailability,
  catalog: SearchCatalogBody | null
): CatalogPresentation {
  // The merged response drops the body whenever the catalog failed, so a
  // missing body means unavailable whatever the label says.
  if (availability === 'unavailable' || !catalog) {
    return { kind: 'local', retryable: true };
  }

  return { kind: 'remote', catalog };
}

function presentPlaylists(
  response: SearchResponse,
  hasLocalPlaylist: (playlistId: string) => boolean
): PlaylistPresentation {
  if (response.playlist_availability === 'unavailable') {
    return { kind: 'unavailable' };
  }

  return {
    kind: 'cards',
    cards: response.playlists.filter((card) => isOpenable(card, hasLocalPlaylist)),
    hasMore: response.playlist_next_page !== null,
  };
}

/** A public playlist opens by code; anything else needs its row on this device. */
function isOpenable(card: SearchPlaylistCard, hasLocalPlaylist: (playlistId: string) => boolean) {
  return card.public_code !== null || hasLocalPlaylist(card.id);
}
