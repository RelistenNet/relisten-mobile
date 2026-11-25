import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

// Track durations format through dayjs, which the app sets up at launch.
import '@/relisten/util/dayjs_setup';
import {
  buildLocalListItems,
  buildRecentListItems,
  buildRemoteListItems,
} from './search_list_items';
import type { SearchPresentation } from './search_presentation';
import {
  markedRuns,
  namedRowSubtitle,
  playlistCardSubtitle,
  recordingNote,
  reviewNote,
  searchPassageFields,
  searchShowFields,
  searchTrackFields,
  showPlace,
  showRowAccessibilityLabel,
} from './search_rows';
import type { SearchResult } from './search_types';
import {
  artist,
  importedVenue,
  performanceRow,
  recordingRow,
  reviewRow,
  sequenceRow,
  show,
  song,
  songRow,
  source,
  yearlyPlays,
} from './search_test_fixtures';

const card = (id: string): SearchResult => ({
  kind: 'playlist',
  key: `playlist:${id}`,
  playlist: { id, name: id, track_count: 1, owned: false, public_code: 'code' },
});

describe('buildRemoteListItems', () => {
  it('preserves the server order of interleaved catalog and playlist rows', () => {
    const rows = [songRow, card('playlist_a'), performanceRow, reviewRow];
    const presentation: SearchPresentation = {
      rows,
      catalog: { kind: 'remote' },
      playlists: { kind: 'available' },
    };
    const items = buildRemoteListItems(presentation, 'all', 'lawn boy');
    expect(items.map((item) => item.key)).toEqual(rows.map((row) => row.key));
    expect(items.map((item) => item.type)).toEqual(['row', 'playlist', 'row', 'row']);
  });

  it('links overflow to the scoped lists without rearranging ranked rows', () => {
    const items = buildRemoteListItems(
      {
        rows: [card('playlist_a')],
        catalog: { kind: 'remote' },
        playlists: { kind: 'available' },
        moreScopes: ['shows', 'sources'],
      },
      'all',
      'dark star'
    );
    expect(items.map((item) => item.key)).toEqual([
      'playlist:playlist_a',
      'more:shows',
      'more:sources',
    ]);
    expect(items.slice(1)).toMatchObject([
      { type: 'header', title: 'More shows', scope: 'shows' },
      { type: 'header', title: 'More sources', scope: 'sources' },
    ]);
  });

  it('offers a retry for playlists that couldn’t load, never "No results"', () => {
    const items = buildRemoteListItems(
      { rows: [], catalog: { kind: 'remote' }, playlists: { kind: 'unavailable' } },
      'all',
      'jams'
    );
    expect(items).toEqual([
      {
        type: 'message',
        key: 'playlists-unavailable',
        text: 'Playlists couldn’t load.',
        retry: true,
      },
    ]);
  });

  it('says there are no results only for a real, empty answer', () => {
    const empty: SearchPresentation = {
      rows: [],
      catalog: { kind: 'remote' },
      playlists: { kind: 'available' },
    };
    expect(buildRemoteListItems(empty, 'all', ' zzz ')).toEqual([
      { type: 'message', key: 'empty', text: 'No results for “zzz”.' },
    ]);
  });

  it('waits when an empty scoped page still has a continuation', () => {
    const page: SearchPresentation = {
      rows: [],
      hasMore: true,
      catalog: { kind: 'none' },
      playlists: { kind: 'available' },
    };
    expect(buildRemoteListItems(page, 'playlists', 'jams')).toEqual([
      { type: 'loading', key: 'loading' },
    ]);
  });
});

describe('buildLocalListItems', () => {
  const nothingDownloaded = { artists: [], shows: [], tracks: [], playlists: [] };

  it('explains a catalog it couldn’t reach, and says when nothing downloaded matches', () => {
    expect(
      buildLocalListItems(nothingDownloaded, { retryable: true, query: ' jams ' })
    ).toMatchObject([
      { type: 'header', title: 'On This Device' },
      { type: 'message', key: 'catalog-unavailable', retry: true },
      { type: 'message', key: 'local-empty', text: 'Nothing downloaded matches “jams”.' },
    ]);
  });

  it('says nothing about the catalog when the device is simply offline', () => {
    const items = buildLocalListItems(nothingDownloaded, { retryable: false, query: 'jams' });
    expect(items.map((item) => item.key)).toEqual(['header:local', 'local-empty']);
  });
});

describe('buildRecentListItems', () => {
  it('offers a hint instead of a blank screen when nothing was played yet', () => {
    expect(buildRecentListItems([], 'Search for shows.')).toEqual([
      { type: 'message', key: 'recent-empty', text: 'Search for shows.' },
    ]);
  });
});

describe('search results as app rows', () => {
  it('draws a show, recording or review as the show list does, with the show’s activity', () => {
    const popular = { ...show, popularity: yearlyPlays(3324) };
    expect(searchShowFields(popular)).toMatchObject({
      displayDate: '2000-06-14',
      hasSoundboardSource: show.has_soundboard_source,
      avgRating: 8.254,
      venueLabel: 'Drum Logos, Fukuoka, Japan',
      sourceCount: show.source_count,
    });
  });

  it('names a venue once when its name already contains its city', () => {
    const named = { ...importedVenue, name: 'Fukuoka Sunpalace', location: 'Fukuoka' };
    expect(showPlace({ ...show, imported_venue: named })).toBe('Fukuoka Sunpalace');
  });

  it('reads SBD aloud as Soundboard and drops highlight marks', () => {
    expect(
      showRowAccessibilityLabel(searchShowFields(show), 'Phish', '“the <mark>Twist</mark> jam”')
    ).toBe(
      '2000-06-14, Soundboard, Phish, Drum Logos, Fukuoka, Japan, rated 8.25, “the Twist jam”'
    );
  });

  it('reports a named recording’s own soundboard mark and rating', () => {
    expect(
      searchShowFields(show, { ...source, is_soundboard: false, avg_rating: 7.5 })
    ).toMatchObject({ hasSoundboardSource: false, avgRating: 7.5 });
    expect(searchShowFields(show, { ...source, avg_rating: 0 }).avgRating).toBe(8.254);
  });

  it('notes a recording by its matching notes or its credits, and a review by its passage', () => {
    const credited = {
      ...recordingRow,
      source: { ...source, taper: 'Betty Cantor', transferrer: 'Charlie Miller' },
    };
    expect(recordingNote(credited)).toBe('Taper: Betty Cantor · Transfer: Charlie Miller');
    expect(
      recordingNote({
        ...credited,
        match: { highlights: { 'source.taper_notes': 'the <mark>Twist</mark>\n jam' } },
      })
    ).toBe('“the <mark>Twist</mark> jam”');
    expect(
      recordingNote({
        ...credited,
        match: { highlights: { 'source.transferrer': '<mark>Charlie Miller</mark>' } },
      })
    ).toBe('Taper: Betty Cantor · Transfer: <mark>Charlie Miller</mark>');
    expect(recordingNote(recordingRow)).toBeUndefined();
    expect(
      reviewNote({
        ...reviewRow,
        match: { highlights: { 'review.review': 'Nice <mark>Twist</mark>\r\n tease' } },
      })
    ).toBe('“Nice <mark>Twist</mark> tease”');
  });

  it('labels a file by its matched song, or by every song it holds', () => {
    expect(searchTrackFields(performanceRow)).toMatchObject({
      title: 'Twist',
      artistName: 'Phish',
      displayDate: '2000-06-14',
      durationLabel: '1:28',
    });
    expect(searchTrackFields({ ...performanceRow, performance: undefined }).title).toBe(
      'Twist -> Jam'
    );
    const songs = [
      { ...song, id: 'song_scarlet' as const, name: 'Scarlet Begonias' },
      { ...song, id: 'song_fire' as const, name: 'Fire On The Mountain' },
    ];
    expect(searchTrackFields({ ...performanceRow, songs }).title).toBe(
      'Scarlet Begonias → Fire On The Mountain'
    );
  });

  it('titles a passage by its songs in order', () => {
    expect(searchPassageFields(sequenceRow)).toMatchObject({
      title: 'Twist → Jam',
      artistName: 'Phish',
    });
  });

  it('splits highlighted text into matched runs without reading it as HTML', () => {
    expect(markedRuns('“the <mark>Twist</mark> <b>jam</b>”')).toEqual([
      { text: '“the ', marked: false },
      { text: 'Twist', marked: true },
      { text: ' <b>jam</b>”', marked: false },
    ]);
  });

  it('words songs, venues and playlists as the library’s list rows do', () => {
    expect(namedRowSubtitle(songRow)).toBe('Phish · Song');
    expect(namedRowSubtitle({ kind: 'venue', key: 'v1', venue: importedVenue, artist })).toBe(
      'Venue · Phish · Fukuoka, Japan'
    );
    expect(playlistCardSubtitle({ id: 'p', name: 'Mix', track_count: 1, owned: true })).toBe(
      '1 track · Yours'
    );
  });
});
