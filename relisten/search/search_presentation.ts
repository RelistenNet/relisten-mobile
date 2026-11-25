import type { SearchSessionState } from './search_session';
import type {
  SearchInterpretationChip,
  SearchMode,
  SearchResult,
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
  | { kind: 'remote' }
  | { kind: 'local'; retryable: boolean };

/**
 * What the playlists half shows. `unavailable` draws a retry in its place,
 * never "No results"; `none` means this search doesn't include playlists.
 */
export type PlaylistPresentation =
  | { kind: 'none' }
  | { kind: 'waiting' }
  | { kind: 'unavailable' }
  | { kind: 'available' };

export interface SearchPresentation {
  rows: SearchResult[];
  /** Later pages may still add rows, even when this one showed none. */
  hasMore?: boolean;
  moreScopes?: SearchResponse['more_scopes'];
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
    return {
      rows: [],
      catalog: { kind: 'recent' },
      playlists: { kind: 'none' },
    };
  }
  // Offline, On this device covers every scope, local playlists included.
  if (!online) {
    return {
      rows: [],
      catalog: { kind: 'local', retryable: false },
      playlists: { kind: 'none' },
    };
  }
  if (state.failed) {
    return {
      rows: [],
      catalog: catalogOr({ kind: 'local', retryable: true }),
      playlists: playlistsOr({ kind: 'unavailable' }),
    };
  }
  if (!response || responseInputs?.scope !== inputs.scope) {
    return {
      rows: [],
      catalog: catalogOr({ kind: 'waiting' }),
      playlists: playlistsOr({ kind: 'waiting' }),
    };
  }

  const { availability } = response;
  return {
    catalog: catalogOr(
      availability.catalog === 'unavailable'
        ? { kind: 'local', retryable: true }
        : { kind: 'remote' }
    ),
    playlists: playlistsOr(
      availability.playlists === 'unavailable' ? { kind: 'unavailable' } : { kind: 'available' }
    ),
    hasMore: response.next_page !== null,
    moreScopes: response.more_scopes,
    rows: response.results.filter((row) =>
      row.kind === 'playlist'
        ? wantsPlaylists && (Boolean(row.playlist.public_code) || hasLocalPlaylist(row.playlist.id))
        : wantsCatalog && availability.catalog !== 'unavailable'
    ),
  };
}

/**
 * The chips above the results: the clues the server read, minus any the
 * listener removed (the previous answer may still carry one), plus an
 * explicit artist filter. A clue that a reading chip already offers isn't
 * repeated as a removable chip. Removing a chip goes through
 * `SearchSession.removeChip`.
 */
export function visibleChips(state: SearchSessionState): SearchInterpretationChip[] {
  const { inputs, response } = state;
  // Keys the reading chips cover. A place reading ("Barton Hall") stands for
  // the venue clue the server reads from the same words.
  const offeredByReadings = new Set(
    visibleReadings(state).flatMap((reading) =>
      reading.chips.flatMap((chip) => (chip.key === 'place' ? ['place', 'venue'] : [chip.key]))
    )
  );
  const read = (response?.readings.applied?.chips ?? []).filter(
    (chip) =>
      !inputs.removedChipKeys.includes(chip.key) &&
      !(chip.key === 'artist' && inputs.artistFilter) &&
      !offeredByReadings.has(chip.key)
  );

  if (!inputs.artistFilter) {
    return read;
  }
  const { artistId, label } = inputs.artistFilter;
  return [{ key: 'artist', label, value: artistId }, ...read];
}

/** The reading that searches the words exactly as typed, with no guessed clues. */
export const LITERAL_READING_ID = 'literal';

/**
 * The readings the listener can pick, while the answer still matches the
 * text and tab they were read from. A reading is shown by its chips, so one
 * without chips can't be told apart from another; only the literal reading
 * gets a chip without them ("Exactly …"). Tapping the selected reading again
 * returns to the server's default, so hiding a chipless default loses nothing.
 */
export function visibleReadings({ inputs, response, responseInputs }: SearchSessionState) {
  if (
    !response ||
    responseInputs?.query !== inputs.query ||
    responseInputs.scope !== inputs.scope
  ) {
    return [];
  }
  const { applied, alternatives } = response.readings;
  if (alternatives.length === 0) {
    return [];
  }
  return (applied ? [applied, ...alternatives] : alternatives).filter(
    (reading) => reading.chips.length > 0 || reading.id === LITERAL_READING_ID
  );
}
