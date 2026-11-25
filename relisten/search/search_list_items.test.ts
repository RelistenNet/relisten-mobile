import { describe, expect, it } from 'vitest';
import { buildRecentListItems, buildRemoteListItems } from './search_list_items';
import type { SearchPresentation } from './search_presentation';
import {
  describeLocalPlaylist,
  describePlaylistCard,
  describeSearchRow,
  markedRuns,
  searchDuration,
  searchPlays,
  searchRowAccessibilityLabel,
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
  showRow,
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
      playlists: { kind: 'available', hasMore: false },
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
        playlists: { kind: 'available', hasMore: false },
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

  it('says there are no results only for a real, empty answer', () => {
    const empty: SearchPresentation = {
      rows: [],
      catalog: { kind: 'remote' },
      playlists: { kind: 'available', hasMore: false },
    };
    expect(buildRemoteListItems(empty, 'all', ' zzz ')).toEqual([
      { type: 'message', key: 'empty', text: 'No results for “zzz”.' },
    ]);
  });

  it('waits when an empty scoped page still has a continuation', () => {
    const page: SearchPresentation = {
      rows: [],
      catalog: { kind: 'none' },
      playlists: { kind: 'available', hasMore: true },
    };
    expect(buildRemoteListItems(page, 'playlists', 'jams')).toEqual([
      { type: 'loading', key: 'loading' },
    ]);
  });
});

describe('buildRecentListItems', () => {
  it('offers a hint instead of a blank screen when nothing was played yet', () => {
    expect(buildRecentListItems([], 'Search for shows.')).toEqual([
      { type: 'message', key: 'recent-empty', text: 'Search for shows.' },
    ]);
  });
});

describe('search row text', () => {
  it('starts each show and song byline with its embedded artist', () => {
    for (const row of [showRow, recordingRow, reviewRow, performanceRow, sequenceRow, songRow]) {
      expect(describeSearchRow(row).byline.startsWith('Phish'), row.kind).toBe(true);
    }
  });

  it('shows the show’s date, location and plays even when it opens a particular recording', () => {
    const view = describeSearchRow({
      ...showRow,
      source,
      popularity: yearlyPlays(3324),
    });
    expect(view).toMatchObject({
      title: '2000-06-14',
      titleStyle: 'date',
      badges: ['SBD'],
      byline: 'Phish',
      place: 'Drum Logos, Fukuoka, Japan',
      aside: ['8.00 ★', '3.3k plays/yr'],
    });
  });

  it('leaves ratings and plays off an unrated show without activity', () => {
    const view = describeSearchRow({ ...showRow, show: { ...show, avg_rating: 0 } });
    expect(view.aside).toEqual([undefined, undefined]);
  });

  it('notes a recording by its matching notes or its credits, and a review by its passage', () => {
    const credited = {
      ...recordingRow,
      source: { ...source, taper: 'Betty Cantor', transferrer: 'Charlie Miller' },
    };
    expect(describeSearchRow(credited).note).toBe('Taper: Betty Cantor · Transfer: Charlie Miller');
    expect(
      describeSearchRow({
        ...credited,
        match: { highlights: { 'source.taper_notes': 'the <mark>Twist</mark>\n jam' } },
      }).note
    ).toBe('“the <mark>Twist</mark> jam”');
    expect(
      describeSearchRow({
        ...credited,
        match: { highlights: { 'source.transferrer': '<mark>Charlie Miller</mark>' } },
      }).note
    ).toBe('Taper: Betty Cantor · Transfer: <mark>Charlie Miller</mark>');
    expect(describeSearchRow(recordingRow).note).toBeUndefined();
    expect(
      describeSearchRow({
        ...reviewRow,
        match: { highlights: { 'review.review': 'Nice <mark>Twist</mark>\r\n tease' } },
      })
    ).toMatchObject({ title: '2000-06-14', note: '“Nice <mark>Twist</mark> tease”' });
  });

  it('formats durations and plays as the app does elsewhere', () => {
    expect(searchDuration(1798)).toBe('29:58');
    expect(searchDuration(3725)).toBe('1:02:05');
    expect(searchPlays(1)).toBe('1 play/yr');
    expect(searchPlays(736)).toBe('736 plays/yr');
    expect(searchPlays(1_000)).toBe('1k plays/yr');
    expect(searchPlays(1_250_000)).toBe('1.3M plays/yr');
  });

  it('labels a performance by its matched song, with the exact file’s duration', () => {
    expect(describeSearchRow({ ...performanceRow, popularity: yearlyPlays(42) })).toEqual({
      title: 'Twist',
      titleStyle: 'track',
      badges: [],
      byline: 'Phish · 2000-06-14',
      place: 'Drum Logos, Fukuoka, Japan',
      aside: ['1:28', undefined, '42 plays/yr'],
    });
    expect(describeSearchRow({ ...performanceRow, performance: undefined }).title).toBe(
      'Twist -> Jam'
    );
  });

  it('names every song in a file that holds several', () => {
    const songs = [
      { ...song, id: 'song_scarlet' as const, name: 'Scarlet Begonias' },
      { ...song, id: 'song_fire' as const, name: 'Fire On The Mountain' },
    ];
    expect(describeSearchRow({ ...performanceRow, songs }).title).toBe(
      'Scarlet Begonias → Fire On The Mountain'
    );
    expect(describeSearchRow({ ...performanceRow, songs: songs.slice(0, 1) }).title).toBe('Twist');
  });

  it('splits highlighted text into matched runs without reading it as HTML', () => {
    expect(markedRuns('“the <mark>Twist</mark> <b>jam</b>”')).toEqual([
      { text: '“the ', marked: false },
      { text: 'Twist', marked: true },
      { text: ' <b>jam</b>”', marked: false },
    ]);
  });

  it('shows ordered passage titles even when two parts share a file', () => {
    const view = describeSearchRow({ ...sequenceRow, popularity: yearlyPlays(1450) });
    expect(view).toMatchObject({
      title: 'Twist → Jam',
      byline: 'Phish · 2000-06-14',
      place: 'Drum Logos, Fukuoka, Japan',
      aside: ['1.4k plays/yr'],
    });
  });

  it('counts one playlist track as a track, remote or local', () => {
    expect(describeLocalPlaylist('Mix', 1).byline).toBe('Playlist · 1 track');
    expect(describePlaylistCard({ id: 'p', name: 'Mix', track_count: 1, owned: true }).byline).toBe(
      'Yours · Playlist · 1 track'
    );
  });

  it('reads SBD aloud as Soundboard', () => {
    expect(searchRowAccessibilityLabel(describeSearchRow(showRow))).toBe(
      '2000-06-14, Soundboard, 8.25 ★, Phish, Drum Logos, Fukuoka, Japan'
    );
  });

  it('names the embedded artist and location on artist-specific venue results', () => {
    expect(
      describeSearchRow({ kind: 'venue', key: 'v1', venue: importedVenue, artist })
    ).toMatchObject({ byline: 'Phish · Venue', place: 'Fukuoka, Japan' });
  });
});
