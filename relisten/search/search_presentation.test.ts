import { describe, expect, it } from 'vitest';
import {
  presentSearch,
  visibleChips,
  visibleReadings,
  type PresentSearchOptions,
} from './search_presentation';
import type { SearchSessionState } from './search_session';
import { SEARCH_INPUTS, searchResponse } from './search_test_fixtures';
import type {
  SearchInterpretationChip,
  SearchResult,
  SearchPlaylistCard,
  SearchResponse,
} from './search_types';

function card(change: Partial<SearchPlaylistCard>): SearchResult {
  return {
    kind: 'playlist',
    key: `playlist:${change.id ?? 'playlist_a'}`,
    playlist: {
      id: 'playlist_a',
      name: 'Jams',
      track_count: 3,
      owned: false,
      public_code: 'code',
      curator: 'someone',
      ...change,
    },
  };
}

function readings(chips: SearchInterpretationChip[] = []) {
  return { applied: { id: 'query', chips }, alternatives: [] };
}

function response(change: Partial<SearchResponse> = {}): SearchResponse {
  return searchResponse({ readings: readings(), ...change });
}

const INPUTS = SEARCH_INPUTS;

function state(
  answer: SearchResponse | null,
  change: Partial<SearchSessionState> = {}
): SearchSessionState {
  return {
    inputs: INPUTS,
    response: answer,
    responseInputs: answer ? INPUTS : null,
    pending: false,
    failed: false,
    loadingMore: false,
    tabTotals: null,
    ...change,
  };
}

const explore: PresentSearchOptions = {
  online: true,
  mode: 'explore',
  hasLocalPlaylist: () => false,
};

describe('presentSearch', () => {
  it('shows On this device and keeps playlists when only the catalog is unavailable', () => {
    const presentation = presentSearch(
      state(
        response({
          availability: { catalog: 'unavailable', playlists: 'full' },
          results: [card({ name: 'Public jams' })],
        })
      ),
      explore
    );

    expect(presentation.catalog).toEqual({ kind: 'local', retryable: true });
    expect(presentation.playlists.kind).toBe('available');
    expect(presentation.rows).toMatchObject([{ playlist: { name: 'Public jams' } }]);
  });

  it('keeps a successful empty answer empty, and offers a retry for an unavailable half', () => {
    const presentation = presentSearch(
      state(
        response({
          availability: { catalog: 'full', playlists: 'unavailable' },
        })
      ),
      explore
    );

    expect(presentation.catalog).toEqual({ kind: 'remote' });
    expect(presentation.playlists).toEqual({ kind: 'unavailable' });
  });

  it('never shows an older answer as the result of a request that failed', () => {
    const presentation = presentSearch(
      state(response(), {
        inputs: { ...INPUTS, query: 'jam band' },
        failed: true,
      }),
      explore
    );

    expect(presentation.catalog).toEqual({ kind: 'local', retryable: true });
    expect(presentation.playlists).toEqual({ kind: 'unavailable' });
  });

  it('doesn’t offer a playlist retry in Add Tracks, which never asks for playlists', () => {
    const presentation = presentSearch(state(null, { failed: true }), {
      ...explore,
      mode: 'add_tracks',
    });

    expect(presentation.playlists).toEqual({ kind: 'none' });
  });

  it('waits instead of showing another scope’s rows', () => {
    const presentation = presentSearch(
      state(response(), { inputs: { ...INPUTS, scope: 'songs' } }),
      explore
    );

    expect(presentation.catalog).toEqual({ kind: 'waiting' });
  });

  it('keeps the previous answer on screen while the text changes', () => {
    const presentation = presentSearch(
      state(response(), {
        inputs: { ...INPUTS, query: 'jam b' },
        pending: true,
      }),
      explore
    );

    expect(presentation.catalog.kind).toBe('remote');
  });

  it('hides an owned private playlist until it has synced to this device', () => {
    const presentation = presentSearch(
      state(
        response({
          scope: 'playlists',
          availability: { catalog: 'not_requested', playlists: 'full' },
          results: [
            card({ id: 'playlist_unsynced', owned: true, public_code: undefined }),
            card({ id: 'playlist_synced', owned: true, public_code: undefined }),
            card({ id: 'playlist_public', public_code: 'abc' }),
          ],
        }),
        {
          inputs: { ...INPUTS, scope: 'playlists' },
          responseInputs: { ...INPUTS, scope: 'playlists' },
        }
      ),
      { ...explore, hasLocalPlaylist: (id) => id === 'playlist_synced' }
    );

    expect(presentation.catalog).toEqual({ kind: 'none' });
    expect(presentation.rows.map((row) => row.key)).toEqual([
      'playlist:playlist_synced',
      'playlist:playlist_public',
    ]);
  });

  it('searches the device offline in every scope, Playlists included', () => {
    const playlistsScope = state(null, {
      inputs: { ...INPUTS, scope: 'playlists' },
    });
    expect(presentSearch(playlistsScope, { ...explore, online: false }).catalog).toEqual({
      kind: 'local',
      retryable: false,
    });
  });

  it('marks playlists as loading, not empty, before the first answer', () => {
    const loading = state(null, {
      inputs: { ...INPUTS, scope: 'playlists' },
      pending: true,
    });
    expect(presentSearch(loading, explore).playlists).toEqual({
      kind: 'waiting',
    });
  });

  it('leaves playlist cards out of Add Tracks', () => {
    const answer = response({ results: [card({ id: 'playlist_public' })] });
    const presentation = presentSearch(state(answer), { ...explore, mode: 'add_tracks' });
    expect(presentation.rows).toEqual([]);
    expect(presentation.playlists).toEqual({ kind: 'none' });
  });

  it('shows Recently Played for an empty field', () => {
    const empty = state(null, { inputs: { ...INPUTS, query: '  ' } });
    expect(presentSearch(empty, explore).catalog).toEqual({ kind: 'recent' });
  });
});

describe('visibleChips', () => {
  const chips = [
    { key: 'artist', label: 'Phish', value: 'artist_x' },
    { key: 'year', label: '2017', value: '2017' },
  ];

  it('hides a chip the listener removed before the next answer drops it', () => {
    const current = state(response({ readings: readings(chips) }), {
      inputs: { ...INPUTS, removedChipKeys: ['year'] },
    });
    expect(visibleChips(current).map((chip) => chip.label)).toEqual(['Phish']);
  });

  it('leaves the clues to the reading chips while readings are offered', () => {
    const answer = response({
      readings: { applied: { id: 'query', chips }, alternatives: [{ id: 'literal', chips: [] }] },
    });
    expect(visibleChips(state(answer))).toEqual([]);
  });

  it('shows an explicit artist filter in place of the artist the server read', () => {
    const current = state(response({ readings: readings(chips) }), {
      inputs: {
        ...INPUTS,
        artistFilter: { artistId: 'artist_b', label: 'Billy Strings' },
      },
    });
    expect(visibleChips(current).map((chip) => chip.label)).toEqual(['Billy Strings', '2017']);
  });
});

describe('visibleReadings', () => {
  // Production's readings for `phish`, 2026-11-25: the default reading has no chips.
  const phish = {
    applied: { id: 'query', chips: [] },
    alternatives: [
      { id: 'literal', chips: [] },
      {
        id: 'artist:artist_6aaf',
        chips: [{ key: 'artist', label: 'Phish', value: 'artist_6aaf' }],
      },
    ],
  };

  it('offers the literal reading and readings with clues, not a chipless default', () => {
    const current = state(response({ readings: phish }));
    expect(visibleReadings(current).map((reading) => reading.id)).toEqual([
      'literal',
      'artist:artist_6aaf',
    ]);
  });

  it('offers nothing once the text has changed since the answer', () => {
    const current = state(response({ readings: phish }), {
      inputs: { ...INPUTS, query: 'phish 97' },
    });
    expect(visibleReadings(current)).toEqual([]);
  });
});
