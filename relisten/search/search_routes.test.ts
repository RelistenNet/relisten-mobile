import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { playlistCardHref, searchArtistRef, searchTapTarget } from './search_routes';
import type { SearchCatalogRow, SearchPlaylistCard } from './search_types';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ARTIST = uuid(1);
const SHOW = uuid(2);
const SOURCE = uuid(3);
const TRACK = uuid(4);

function base(change: Partial<SearchCatalogRow>): SearchCatalogRow {
  return {
    id: '',
    kind: 'show',
    label: '',
    artist_label: 'Phish',
    artist_slug: 'phish',
    artist_id: encodeUuidCatalogId(ARTIST, 'artist'),
    date: 20000614,
    venue_label: 'Drum Logos',
    city_label: 'Fukuoka',
    venue_id: '',
    show_id: encodeUuidCatalogId(SHOW, 'show'),
    tour_label: '',
    song_id: '',
    source_id: '',
    source_upstream: '',
    soundboard: false,
    soundcheck: false,
    ...change,
  } as SearchCatalogRow;
}

const artist = { uuid: ARTIST };

describe('searchTapTarget', () => {
  it('opens a performance at its exact source, focused on the file, not played', () => {
    const row = base({
      kind: 'performance',
      preview: {
        track_id: encodeUuidCatalogId(TRACK, 'track'),
        source_id: encodeUuidCatalogId(SOURCE, 'source'),
        set: 'Set 2',
        set_index: 1,
        position: 10,
        duration: 1108,
        soundboard: false,
        soundcheck: false,
        label: 'Twist',
      },
    } as Partial<SearchCatalogRow>);

    expect(searchTapTarget(row, artist, '(search)')).toEqual({
      kind: 'push',
      href: {
        pathname: '/relisten/tabs/(search)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
        params: {
          artistUuid: ARTIST,
          showUuid: SHOW,
          sourceUuid: SOURCE,
          exactSource: '1',
          focusTrackUuid: TRACK,
        },
      },
    });
  });

  it('opens a recording by its own ID, since its source_id is empty', () => {
    const row = base({ kind: 'recording', id: encodeUuidCatalogId(SOURCE, 'source') });
    const target = searchTapTarget(row, artist, '(search)');
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { sourceUuid: SOURCE, showUuid: SHOW },
    });
  });

  it('opens a review on the reviewed recording, where the show and its reviews are', () => {
    const row = base({ kind: 'review', source_id: encodeUuidCatalogId(SOURCE, 'source') });
    const target = searchTapTarget(row, artist, '(search)');
    expect(target.kind === 'push' && target.href).toMatchObject({
      pathname: '/relisten/tabs/(search)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
      params: { showUuid: SHOW, sourceUuid: SOURCE, exactSource: '1' },
    });
  });

  it('opens a passage at its first file', () => {
    const row: SearchCatalogRow = {
      kind: 'sequence',
      artist_slug: 'grateful-dead',
      show_id: encodeUuidCatalogId(SHOW, 'show'),
      source_id: encodeUuidCatalogId(SOURCE, 'source'),
      set: 'Set 2',
      date: 19770508,
      venue: 'Barton Hall',
      song_ids: ['song_aaaaaaaa', 'song_bbbbbbbb'],
      track_ids: [encodeUuidCatalogId(TRACK, 'track'), encodeUuidCatalogId(uuid(5), 'track')],
    };
    const target = searchTapTarget(row, artist, '(search)');
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { focusTrackUuid: TRACK },
    });
  });

  it('opens a show without a named source through the source settings', () => {
    expect(searchTapTarget(base({ kind: 'show' }), artist, '(search)')).toEqual({
      kind: 'show',
      showUuid: SHOW,
    });
  });

  it('sends a shared venue to the shared page with no artist, and an imported one to the artist’s', () => {
    const shared = base({ kind: 'venue', venue_id: 'venue_bvhfka1g', artist_id: undefined });
    expect(searchArtistRef(shared)).toBeNull();
    expect(searchTapTarget(shared, null, '(search)')).toEqual({
      kind: 'push',
      href: {
        pathname: '/relisten/tabs/(search)/venue/[venueId]/',
        params: { venueId: 'venue_bvhfka1g' },
      },
    });

    const imported = base({
      kind: 'venue',
      venue_id: encodeUuidCatalogId(uuid(9), 'imported_venue'),
    });
    const target = searchTapTarget(imported, artist, '(search)');
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { artistUuid: ARTIST, venueUuid: uuid(9), venueKind: 'imported_venue' },
    });
  });

  it('passes song IDs to the song page as they are', () => {
    const target = searchTapTarget(base({ kind: 'song', id: 'song_hf5bcx7b' }), artist, '(search)');
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { songUuid: 'song_hf5bcx7b' },
    });
  });

  it('loads recording, review and passage artists by slug', () => {
    expect(searchArtistRef(base({ kind: 'recording', artist_id: undefined }))).toEqual({
      slug: 'phish',
    });
    expect(searchArtistRef(base({ kind: 'show' }))).toEqual({ uuid: ARTIST });
  });
});

describe('playlistCardHref', () => {
  const card: SearchPlaylistCard = {
    kind: 'playlist',
    id: 'playlist_x',
    label: 'Jams',
    description: null,
    track_count: 2,
    owned: false,
    public_code: 'abc',
    curator: 'someone',
  };

  it('opens a playlist on this device by ID, and anything else by its public code', () => {
    expect(playlistCardHref(card, true, '(search)')).toMatchObject({
      params: { playlistId: 'playlist_x' },
    });
    expect(playlistCardHref(card, false, '(search)')).toMatchObject({
      params: { publicCode: 'abc' },
    });
    expect(playlistCardHref({ ...card, public_code: null }, false, '(search)')).toBeUndefined();
  });
});
