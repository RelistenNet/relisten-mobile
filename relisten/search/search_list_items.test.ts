import { describe, expect, it } from 'vitest';
import { buildRecentListItems, buildRemoteListItems } from './search_list_items';
import type { SearchPresentation } from './search_presentation';
import {
  describeLocalPlaylist,
  describePlaylistCard,
  describeSearchRow,
  searchDate,
  searchDuration,
  searchPlays,
  searchRowAccessibilityLabel,
} from './search_rows';
import type { SearchCatalogBody, SearchCatalogRow, SearchPlaylistCard } from './search_types';

function row(id: string, change: Partial<SearchCatalogRow> = {}): SearchCatalogRow {
  return {
    id,
    kind: 'show',
    label: id,
    artist_label: 'Phish',
    artist_slug: 'phish',
    date: 20170725,
    venue_label: 'Madison Square Garden',
    city_label: 'New York',
    venue_id: '',
    show_id: '',
    tour_label: '',
    song_id: '',
    source_id: '',
    source_upstream: '',
    soundboard: false,
    soundcheck: false,
    ...change,
  } as SearchCatalogRow;
}

function catalog(change: Partial<SearchCatalogBody>): SearchCatalogBody {
  return {
    availability: 'full',
    interpretation: { terms: '', chips: [] },
    counts: { artists: 0, songs: 0, venues: 0, shows: 0, sources: 0 },
    ...change,
  };
}

const card = (id: string): SearchPlaylistCard => ({
  kind: 'playlist',
  id,
  label: id,
  description: null,
  track_count: 1,
  owned: false,
  public_code: 'code',
  curator: null,
});

describe('buildRemoteListItems', () => {
  it('lists top rows, then sources, reviews and passages, then at most six playlists', () => {
    const presentation: SearchPresentation = {
      catalog: {
        kind: 'remote',
        catalog: catalog({
          top: [row('show_a')],
          sections: {
            sources: [row('source_a', { kind: 'recording' })],
            reviews: [row('review_a', { kind: 'review' })],
            passages: [],
          },
        }),
      },
      playlists: {
        kind: 'cards',
        cards: Array.from({ length: 8 }, (_, n) => card(`playlist_${n}`)),
        hasMore: false,
      },
    };

    const items = buildRemoteListItems(presentation, 'all', 'lawn boy');
    expect(items.map((item) => (item.type === 'header' ? `# ${item.title}` : item.type))).toEqual([
      'row',
      '# Sources',
      'row',
      '# Reviews',
      'row',
      '# Playlists',
      ...Array(6).fill('playlist'),
    ]);
    // Section headers that have a scope link to it; Passages would not.
    expect(items.find((item) => item.type === 'header' && item.title === 'Sources')).toMatchObject({
      scope: 'sources',
    });
  });

  it('keeps two performances from one show as separate rows', () => {
    const preview = (track: string) => ({
      track_id: track,
      source_id: 'source_x',
      set: 'Set 1',
      set_index: 0,
      position: 1,
      duration: 60,
      soundboard: false,
      soundcheck: false,
      label: 'Lawn Boy',
    });
    const presentation: SearchPresentation = {
      catalog: {
        kind: 'remote',
        catalog: catalog({
          results: [
            row('perf_1', {
              kind: 'performance',
              preview: preview('track_long'),
            } as Partial<SearchCatalogRow>),
            row('perf_1', {
              kind: 'performance',
              preview: preview('track_short'),
            } as Partial<SearchCatalogRow>),
          ],
        }),
      },
      playlists: { kind: 'none' },
    };

    expect(
      buildRemoteListItems(presentation, 'songs', 'lawn boy').filter((i) => i.type === 'row')
    ).toHaveLength(2);
  });

  it('says there are no results only for a real, empty answer', () => {
    const empty: SearchPresentation = {
      catalog: { kind: 'remote', catalog: catalog({ top: [], sections: {} }) },
      playlists: { kind: 'cards', cards: [], hasMore: false },
    };
    expect(buildRemoteListItems(empty, 'all', ' zzz ')).toEqual([
      { type: 'message', key: 'empty', text: 'No results for “zzz”.' },
    ]);

    const waiting: SearchPresentation = {
      catalog: { kind: 'waiting' },
      playlists: { kind: 'none' },
    };
    expect(buildRemoteListItems(waiting, 'all', 'zzz')).toEqual([
      { type: 'loading', key: 'loading' },
    ]);
  });
});

describe('buildRemoteListItems in the Playlists scope', () => {
  it('waits instead of saying “No results” while playlists load or more pages remain', () => {
    const loading: SearchPresentation = {
      catalog: { kind: 'none' },
      playlists: { kind: 'waiting' },
    };
    expect(buildRemoteListItems(loading, 'playlists', 'jams')).toEqual([
      { type: 'loading', key: 'loading' },
    ]);

    const emptyPageWithMore: SearchPresentation = {
      catalog: { kind: 'none' },
      playlists: { kind: 'cards', cards: [], hasMore: true },
    };
    expect(buildRemoteListItems(emptyPageWithMore, 'playlists', 'jams')).toEqual([
      { type: 'loading', key: 'loading' },
    ]);
  });
});

describe('buildRemoteListItems sections', () => {
  it('drops a section header whose rows all repeat rows already listed', () => {
    const presentation: SearchPresentation = {
      catalog: {
        kind: 'remote',
        catalog: catalog({ top: [row('show_a')], sections: { sources: [row('show_a')] } }),
      },
      playlists: { kind: 'none' },
    };
    expect(buildRemoteListItems(presentation, 'all', 'x').map((item) => item.type)).toEqual([
      'row',
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
  const names = (artist: string) => ({ byId: () => artist, bySlug: () => artist });

  it('starts the line under every title with the artist', () => {
    const kinds = ['show', 'recording', 'review', 'performance', 'song', 'tour'] as const;
    for (const kind of kinds) {
      const view = describeSearchRow(
        row(kind, { kind, preview: PREVIEW } as Partial<SearchCatalogRow>),
        names('Phish')
      );
      expect(view.byline.startsWith('Phish'), kind).toBe(true);
    }
  });

  it('stacks a show as date, artist, then venue and location, with its rating and plays', () => {
    const view = describeSearchRow(
      row('s1', {
        kind: 'show',
        soundboard: true,
        avg_rating: 8.254,
        track_plays: 3324,
        location_label: 'New York, NY',
      })
    );
    expect(view).toEqual({
      title: '2017-07-25',
      titleStyle: 'date',
      badges: ['SBD'],
      byline: 'Phish',
      place: 'Madison Square Garden, New York, NY',
      note: undefined,
      noteItalic: true,
      aside: ['8.25 ★', '3.3k plays/yr'],
    });
  });

  it('falls back to the city, and leaves the rating and plays out, on an older index', () => {
    const view = describeSearchRow(row('s0', { kind: 'show', track_plays: 0 }));
    expect(view.place).toBe('Madison Square Garden, New York');
    expect(view.aside).toEqual([undefined, undefined]);
  });

  it('notes a recording by its matching notes or its credits, never its ID, and a review by its passage', () => {
    const credited = row('r1', {
      kind: 'recording',
      source_upstream: 'gd77.sbd',
      taper_label: 'Betty Cantor',
      transferrer_label: 'Charlie Miller',
    });
    expect(describeSearchRow(credited).note).toBe('Taper: Betty Cantor · Transfer: Charlie Miller');
    expect(
      describeSearchRow(
        row('r1', {
          kind: 'recording',
          taper_label: 'Betty Cantor',
          highlights: { notes: 'the <mark>Twist</mark> jam' },
        })
      ).note
    ).toBe('“the Twist jam”');
    expect(
      describeSearchRow(row('r2', { kind: 'recording', source_upstream: 'gd77.sbd' })).note
    ).toBe(undefined);
    const review = describeSearchRow(
      row('review_1', {
        kind: 'review',
        label: '',
        highlights: { review_text: 'Nice <mark>Twist</mark>\r\n tease' },
      })
    );
    expect(review).toMatchObject({ title: '2017-07-25', note: '“Nice Twist tease”' });
  });

  it('formats dates, durations and plays as the app does elsewhere', () => {
    expect(searchDate(19770508)).toBe('1977-05-08');
    expect(searchDuration(1798)).toBe('29:58');
    expect(searchDuration(3725)).toBe('1:02:05');
    expect(searchPlays(1)).toBe('1 play/yr');
    expect(searchPlays(736)).toBe('736 plays/yr');
    expect(searchPlays(1_000)).toBe('1k plays/yr');
    expect(searchPlays(1_250_000)).toBe('1.3M plays/yr');
  });

  it('stacks a performance as song, artist and date, then venue; duration, set and plays on the right', () => {
    const view = describeSearchRow(
      row('perf', { kind: 'performance', preview: PREVIEW } as Partial<SearchCatalogRow>)
    );
    expect(view).toEqual({
      title: 'Lawn Boy',
      titleStyle: 'track',
      badges: ['SBD'],
      byline: 'Phish · 2017-07-25',
      place: 'Madison Square Garden, New York',
      aside: ['1:28', 'Encore', '42 plays/yr'],
    });
  });

  it('leaves out a generic set name', () => {
    const view = describeSearchRow(
      row('perf2', {
        kind: 'performance',
        preview: { ...PREVIEW, set: 'Set' },
      } as Partial<SearchCatalogRow>)
    );
    expect(view.aside[1]).toBeUndefined();
  });

  it('names a passage’s artist from its slug and drops a generic set name', () => {
    const view = describeSearchRow(
      {
        kind: 'sequence',
        artist_slug: 'grateful-dead',
        show_id: 'show_1',
        source_id: 'source_1',
        set: 'Set',
        date: 19770508,
        venue: 'Barton Hall',
        song_ids: ['song_a', 'song_b'],
        track_ids: ['track_a', 'track_b'],
      },
      names('Grateful Dead')
    );
    expect(view).toMatchObject({
      byline: 'Grateful Dead',
      place: 'Barton Hall',
      note: 'Passage of 2 songs',
    });
  });

  it('counts one playlist track as a track, remote or local', () => {
    expect(describeLocalPlaylist('Mix', 1).byline).toBe('Playlist · 1 track');
    expect(
      describePlaylistCard({
        kind: 'playlist',
        id: 'p',
        label: 'Mix',
        description: null,
        track_count: 1,
        owned: true,
        public_code: null,
        curator: null,
      }).byline
    ).toBe('Yours · Playlist · 1 track');
  });

  it('reads SBD aloud as Soundboard', () => {
    const view = describeSearchRow(row('s2', { kind: 'show', soundboard: true }));
    expect(searchRowAccessibilityLabel(view)).toBe(
      '2017-07-25, Soundboard, Phish, Madison Square Garden, New York'
    );
  });

  it('spells the artist as the device does when it knows the artist', () => {
    const view = describeSearchRow(
      row('s1', { kind: 'show', artist_label: 'mars mushrooms', artist_id: 'artist_m' }),
      names('Mars Mushrooms')
    );
    expect(view.byline).toBe('Mars Mushrooms');
  });

  it('names a venue’s artists from the device when the row carries only IDs or slugs', () => {
    const deviceNames = {
      byId: (id: string) => (id === 'artist_x' ? 'Grace Potter' : undefined),
      bySlug: (slug: string) =>
        ({ 'grateful-dead': 'Grateful Dead', 'dead-and-co': 'Dead & Company' })[slug],
    };
    expect(
      describeSearchRow(
        row('v1', { kind: 'venue', artist_label: '', artist_id: 'artist_x' }),
        deviceNames
      )
    ).toMatchObject({ byline: 'Grace Potter · Venue', place: 'New York' });
    expect(
      describeSearchRow(
        row('v2', {
          kind: 'venue',
          artist_label: '',
          artist_slugs: ['dead-and-co', 'grateful-dead', 'other'],
        }),
        deviceNames
      ).byline
    ).toBe('Dead & Company, Grateful Dead +1 · Venue');
  });
});

const PREVIEW = {
  track_id: 't',
  source_id: 's',
  set: 'Encore',
  set_index: 2,
  position: 19,
  duration: 88,
  plays: 42,
  soundboard: true,
  soundcheck: false,
  label: 'Lawn Boy',
};
