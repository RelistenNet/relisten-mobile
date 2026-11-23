import { describe, expect, it } from 'vitest';
import { presentSearch, visibleChips, type PresentSearchOptions } from './search_presentation';
import type { SearchInputs, SearchSessionState } from './search_session';
import type { SearchCatalogBody, SearchPlaylistCard, SearchResponse } from './search_types';

function card(change: Partial<SearchPlaylistCard>): SearchPlaylistCard {
  return {
    kind: 'playlist',
    id: 'playlist_a',
    label: 'Jams',
    description: null,
    track_count: 3,
    owned: false,
    public_code: 'code',
    curator: 'someone',
    ...change,
  };
}

function catalog(chips: SearchCatalogBody['interpretation']['chips'] = []): SearchCatalogBody {
  return {
    availability: 'full',
    interpretation: { terms: 'jam', chips },
    counts: { artists: 0, songs: 0, venues: 0, shows: 0, sources: 0 },
    top: [],
    sections: {},
  };
}

function response(change: Partial<SearchResponse> = {}): SearchResponse {
  return {
    q: 'jam',
    request_id: null,
    catalog_availability: 'full',
    playlist_availability: 'full',
    catalog: catalog(),
    playlists: [],
    page: 1,
    playlist_next_page: null,
    ...change,
  };
}

const INPUTS: SearchInputs = {
  query: 'jam',
  scope: 'all',
  removedChipKeys: [],
  artistFilter: null,
};

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
          catalog_availability: 'unavailable',
          catalog: null,
          playlists: [card({ label: 'Public jams' })],
        })
      ),
      explore
    );

    expect(presentation.catalog).toEqual({ kind: 'local', retryable: true });
    expect(presentation.playlists).toMatchObject({
      kind: 'cards',
      cards: [{ label: 'Public jams' }],
    });
  });

  it('keeps a successful empty answer empty, and offers a retry for an unavailable half', () => {
    const empty = catalog();
    const presentation = presentSearch(
      state(response({ catalog: empty, playlist_availability: 'unavailable' })),
      explore
    );

    expect(presentation.catalog).toEqual({ kind: 'remote', catalog: empty });
    expect(presentation.playlists).toEqual({ kind: 'unavailable' });
  });

  it('never shows an older answer as the result of a request that failed', () => {
    const presentation = presentSearch(
      state(response(), { inputs: { ...INPUTS, query: 'jam band' }, failed: true }),
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
      state(response(), { inputs: { ...INPUTS, query: 'jam b' }, pending: true }),
      explore
    );

    expect(presentation.catalog.kind).toBe('remote');
  });

  it('hides an owned private playlist until it has synced to this device', () => {
    const presentation = presentSearch(
      state(
        response({
          catalog_availability: 'not_requested',
          catalog: null,
          playlists: [
            card({ id: 'playlist_unsynced', owned: true, public_code: null }),
            card({ id: 'playlist_synced', owned: true, public_code: null }),
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
    expect(
      presentation.playlists.kind === 'cards' && presentation.playlists.cards.map((c) => c.id)
    ).toEqual(['playlist_synced', 'playlist_public']);
  });

  it('searches the device while offline', () => {
    expect(presentSearch(state(null), { ...explore, online: false }).catalog).toEqual({
      kind: 'local',
      retryable: false,
    });
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
    const current = state(response({ catalog: catalog(chips) }), {
      inputs: { ...INPUTS, removedChipKeys: ['year'] },
    });
    expect(visibleChips(current).map((chip) => chip.label)).toEqual(['Phish']);
  });

  it('shows an explicit artist filter in place of the artist the server read', () => {
    const current = state(response({ catalog: catalog(chips) }), {
      inputs: { ...INPUTS, artistFilter: { artistId: 'artist_b', label: 'Billy Strings' } },
    });
    expect(visibleChips(current).map((chip) => chip.label)).toEqual(['Billy Strings', '2017']);
  });
});
