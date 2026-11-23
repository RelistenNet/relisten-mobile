import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchSession, type SearchContext } from './search_session';
import type { SearchRequest, SearchResponse } from './search_types';

interface PendingFetch {
  request: SearchRequest;
  signal: AbortSignal;
  resolve(response: SearchResponse): void;
  reject(error: Error): void;
}

function response(q: string, playlistLabels: string[] = []): SearchResponse {
  return {
    q,
    request_id: null,
    catalog_availability: 'full',
    playlist_availability: 'full',
    catalog: {
      availability: 'full',
      interpretation: { terms: q, chips: [] },
      counts: { artists: 0, songs: 0, venues: 0, shows: 0, sources: 0 },
      top: [],
      sections: {},
    },
    playlists: playlistLabels.map((label, index) => ({
      kind: 'playlist',
      id: `playlist_${index}`,
      label,
      description: null,
      track_count: 1,
      owned: true,
      public_code: null,
      curator: null,
    })),
    page: 1,
    playlist_next_page: null,
  };
}

function context(change: Partial<SearchContext> = {}): SearchContext {
  return { accountKey: 'alice', signedIn: true, online: true, boostArtistIds: [], ...change };
}

describe('SearchSession', () => {
  let fetches: PendingFetch[];
  let session: SearchSession;

  beforeEach(() => {
    vi.useFakeTimers();
    fetches = [];
    session = new SearchSession('explore', (request, _signedIn, signal) => {
      // Ignores the abort, like an answer whose body is already being read
      // when the query changes, so only the generation check can drop it.
      return new Promise<SearchResponse>((resolve, reject) => {
        fetches.push({ request, signal, resolve, reject });
      });
    });
    session.setContext(context());
  });

  afterEach(() => {
    session.dispose();
    vi.useRealTimers();
  });

  it('drops an answer to the old query that lands during the new query’s debounce', async () => {
    session.setQuery('lawn');
    await vi.advanceTimersByTimeAsync(120);
    expect(fetches).toHaveLength(1);

    session.setQuery('lawn boy');
    // The old request is aborted the moment the query changes...
    expect(fetches[0].signal.aborted).toBe(true);
    // ...and even if its answer still arrives, it is not rendered.
    fetches[0].resolve(response('lawn'));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().response).toBeNull();
    expect(session.getSnapshot().pending).toBe(true);

    await vi.advanceTimersByTimeAsync(120);
    expect(fetches).toHaveLength(2);
    expect(fetches[1].request.q).toBe('lawn boy');
    expect(fetches[1].request.typing).toBe(true);
    fetches[1].resolve(response('lawn boy'));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().response?.q).toBe('lawn boy');
    expect(session.getSnapshot().pending).toBe(false);
  });

  it('keeps the current results on screen until the next answer replaces them', async () => {
    session.setQuery('tweezer');
    session.submit();
    fetches[0].resolve(response('tweezer'));
    await vi.advanceTimersByTimeAsync(0);

    session.setQuery('tweezer reprise');
    expect(session.getSnapshot().response?.q).toBe('tweezer');
    expect(session.getSnapshot().responseInputs?.query).toBe('tweezer');
  });

  it('discards an answer that completes after an account switch and clears the list', async () => {
    session.setQuery('jam');
    session.submit();
    fetches[0].resolve(response('jam', ['Alice private jams']));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().response?.playlists).toHaveLength(1);

    session.submit();
    session.setContext(context({ accountKey: 'bob' }));
    // Alice's list is gone at once, before Bob's answer arrives.
    expect(session.getSnapshot().response).toBeNull();

    // A late answer fetched for Alice never reaches the screen.
    fetches[1].resolve(response('jam', ['Alice private jams']));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().response).toBeNull();

    fetches[2].resolve(response('jam', ['Bob public jams']));
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getSnapshot().response?.playlists[0].label).toBe('Bob public jams');
  });

  it('sends removed chips and Add Tracks’ playlist exclusion in ignore', async () => {
    const addTracks = new SearchSession('add_tracks', (request, _signedIn, signal) => {
      fetches.push({ request, signal, resolve: () => {}, reject: () => {} });
      return new Promise<SearchResponse>(() => {});
    });
    addTracks.setContext(context());

    addTracks.setQuery('phish 2017');
    addTracks.removeChip('year');

    expect(fetches.at(-1)?.request).toMatchObject({
      mode: 'add_tracks',
      typing: false,
      ignore: ['year', 'playlists'],
    });
    addTracks.dispose();
  });

  it('clears an explicit artist filter when its chip is removed', () => {
    session.setQuery('creek');
    session.setArtistFilter({ artistId: 'artist_1', label: 'Billy Strings' });
    expect(fetches.at(-1)?.request.artistId).toBe('artist_1');

    session.removeChip('artist');
    expect(session.getSnapshot().inputs.artistFilter).toBeNull();
    expect(fetches.at(-1)?.request.artistId).toBeUndefined();
    expect(fetches.at(-1)?.request.ignore).toEqual([]);
  });

  it('gives each request a larger request_id', () => {
    session.setQuery('a');
    session.submit();
    session.submit();
    const [first, second] = fetches.map((fetch) => fetch.request.requestId);
    expect(first).not.toBe(second);
    expect(Number(second.split('-')[1])).toBeGreaterThan(Number(first.split('-')[1]));
  });

  it('stays quiet offline and searches again on reconnect', () => {
    session.setContext(context({ online: false }));
    session.setQuery('creek');
    session.submit();
    expect(fetches).toHaveLength(0);

    session.setContext(context({ online: true }));
    expect(fetches).toHaveLength(1);
    expect(fetches[0].request.q).toBe('creek');
  });

  it('drops a pending debounce when the app goes offline', async () => {
    session.setQuery('creek');
    session.setContext(context({ online: false }));
    await vi.advanceTimersByTimeAsync(500);
    expect(fetches).toHaveLength(0);
    expect(session.getSnapshot().pending).toBe(false);
  });

  it('brings removed chips back when the text changes', () => {
    session.setQuery('phish 2017');
    session.removeChip('year');
    expect(session.getSnapshot().inputs.removedChipKeys).toEqual(['year']);

    session.setQuery('phish 2019');
    expect(session.getSnapshot().inputs.removedChipKeys).toEqual([]);
  });

  it('reports a failed request so the screen can offer a retry', async () => {
    const failing = new SearchSession('explore', () => Promise.reject(new Error('offline')));
    failing.setContext(context());
    failing.setQuery('creek');
    failing.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(failing.getSnapshot().failed).toBe(true);
    expect(failing.getSnapshot().pending).toBe(false);
    failing.dispose();
  });

  it('marks a failure even with an older answer on screen, and clears it on retry', async () => {
    session.setQuery('lawn');
    session.submit();
    fetches[0].resolve(response('lawn'));
    await vi.advanceTimersByTimeAsync(0);

    session.setQuery('lawn boy');
    session.submit();
    fetches.at(-1)!.reject(new Error('offline'));
    await vi.advanceTimersByTimeAsync(0);
    // The old answer is still held, so the screen must check `failed` first.
    expect(session.getSnapshot()).toMatchObject({ failed: true, pending: false });
    expect(session.getSnapshot().responseInputs?.query).toBe('lawn');

    session.retry();
    expect(session.getSnapshot()).toMatchObject({ failed: false, pending: true });
    expect(fetches.at(-1)?.request.q).toBe('lawn boy');
  });
});
