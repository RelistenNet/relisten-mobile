import { describe, expect, it, vi } from 'vitest';
import type { AuthorizedAccountsApiClient } from '@/relisten/accounts/api/accounts_api_client';
import { fetchSearch, searchPath } from './search_client';
import type { SearchRequest } from './search_types';

const request: SearchRequest = {
  q: 'red rocks creek',
  scope: 'all',
  mode: 'add_tracks',
  typing: true,
  requestId: '3-7',
};

function query(path: string) {
  expect(path.startsWith('/v1/search?')).toBe(true);
  return new URLSearchParams(path.slice('/v1/search?'.length));
}

describe('searchPath', () => {
  it('sends ignore and boosts comma-separated, as the server splits them', () => {
    const params = query(
      searchPath({
        ...request,
        ignore: ['year', 'playlists'],
        boostArtistIds: ['artist_a', 'artist_b'],
        artistId: 'artist_c',
      })
    );

    expect(params.get('ignore')).toBe('year,playlists');
    expect(params.get('boost_artist_ids')).toBe('artist_a,artist_b');
    expect(params.get('artist_id')).toBe('artist_c');
    expect(params.get('typing')).toBe('true');
    expect(params.get('request_id')).toBe('3-7');
  });

  it('leaves out empty lists and the first page', () => {
    const params = query(searchPath({ ...request, ignore: [], boostArtistIds: [], page: 1 }));
    expect(params.has('ignore')).toBe(false);
    expect(params.has('boost_artist_ids')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(params.has('artist_id')).toBe(false);
  });
});

describe('fetchSearch', () => {
  it('uses the account token when signed in and none when signed out', async () => {
    const api = {
      request: vi.fn().mockResolvedValue({}),
      requestAnonymously: vi.fn().mockResolvedValue({}),
    };
    const signal = new AbortController().signal;

    await fetchSearch(api as unknown as AuthorizedAccountsApiClient, request, true, signal);
    await fetchSearch(api as unknown as AuthorizedAccountsApiClient, request, false, signal);

    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request.mock.calls[0][1]).toMatchObject({ signal });
    expect(api.requestAnonymously).toHaveBeenCalledTimes(1);
    expect(api.requestAnonymously.mock.calls[0][1]).toMatchObject({ signal });
  });
});
