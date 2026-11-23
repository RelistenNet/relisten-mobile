import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { addableTrack, addTracksTapTarget } from './add_tracks_routes';
import type { SearchCatalogRow } from './search_types';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ARTIST = uuid(1);
const SHOW = uuid(2);
const SOURCE = uuid(3);
const TRACK = uuid(4);
const PLAYLIST = 'playlist_01m836fykfetx92xm6rwxdtt3s';

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

const twist = base({
  kind: 'performance',
  label: 'Twist',
  song_id: 'song_hf5bcx7b',
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

describe('addTracksTapTarget', () => {
  it('narrows in place for an artist', () => {
    const row = base({ kind: 'artist', id: 'artist_x', label: 'Phish' });
    expect(addTracksTapTarget(row, PLAYLIST)).toEqual({
      kind: 'narrow-artist',
      artistId: 'artist_x',
      label: 'Phish',
    });
  });

  it('narrows a tour to its shows under its artist', () => {
    const row = base({ kind: 'tour', label: 'Summer Tour 2000', artist: 'phish' });
    expect(addTracksTapTarget(row, PLAYLIST)).toEqual({
      kind: 'narrow-tour',
      label: 'Summer Tour 2000',
      artistId: encodeUuidCatalogId(ARTIST, 'artist'),
      artistLabel: 'Phish',
      artistName: 'phish',
    });
  });

  it('opens a performance at its exact source, focused on the file and its song', () => {
    expect(addTracksTapTarget(twist, PLAYLIST)).toEqual({
      kind: 'push',
      href: {
        pathname: '/relisten/add-tracks/source',
        params: {
          playlistId: PLAYLIST,
          showUuid: SHOW,
          sourceUuid: SOURCE,
          focusTrackUuid: TRACK,
          focusSongId: 'song_hf5bcx7b',
        },
      },
    });
  });

  it('opens a show at its default source', () => {
    const target = addTracksTapTarget(base({ kind: 'show' }), PLAYLIST);
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { playlistId: PLAYLIST, showUuid: SHOW, sourceUuid: 'initial' },
    });
  });

  it('opens a recording at that source and a passage at its first file', () => {
    const recording = addTracksTapTarget(
      base({ kind: 'recording', id: encodeUuidCatalogId(SOURCE, 'source') }),
      PLAYLIST
    );
    expect(recording.kind === 'push' && recording.href).toMatchObject({
      params: { showUuid: SHOW, sourceUuid: SOURCE },
    });

    const passage = addTracksTapTarget(
      {
        kind: 'sequence',
        artist_slug: 'grateful-dead',
        show_id: encodeUuidCatalogId(SHOW, 'show'),
        source_id: encodeUuidCatalogId(SOURCE, 'source'),
        set: 'Set 2',
        date: 19770508,
        venue: 'Barton Hall',
        song_ids: ['song_aaaaaaaa', 'song_bbbbbbbb'],
        track_ids: [encodeUuidCatalogId(TRACK, 'track'), encodeUuidCatalogId(uuid(5), 'track')],
      },
      PLAYLIST
    );
    expect(passage.kind === 'push' && passage.href).toMatchObject({
      params: { sourceUuid: SOURCE, focusTrackUuid: TRACK },
    });
  });

  it("lists a venue's shows, under its artist only when the venue has one", () => {
    const shared = addTracksTapTarget(
      base({ kind: 'venue', venue_id: 'venue_bvhfka1g', artist_id: undefined }),
      PLAYLIST
    );
    expect(shared).toEqual({
      kind: 'push',
      href: {
        pathname: '/relisten/add-tracks/shows',
        params: { playlistId: PLAYLIST, kind: 'venue', venueId: 'venue_bvhfka1g' },
      },
    });

    const imported = addTracksTapTarget(base({ kind: 'venue', venue_id: 'v' }), PLAYLIST);
    expect(imported.kind === 'push' && imported.href).toMatchObject({
      params: { kind: 'venue', venueId: 'v', artistUuid: ARTIST },
    });
  });

  it("lists a song's shows under its artist", () => {
    const target = addTracksTapTarget(base({ kind: 'song', id: 'song_hf5bcx7b' }), PLAYLIST);
    expect(target.kind === 'push' && target.href).toMatchObject({
      pathname: '/relisten/add-tracks/shows',
      params: { kind: 'song', songId: 'song_hf5bcx7b', artistUuid: ARTIST },
    });
  });
});

describe('addableTrack', () => {
  it("adds a performance's preview file", () => {
    expect(addableTrack(twist)).toEqual({
      trackId: encodeUuidCatalogId(TRACK, 'track'),
      title: 'Twist',
    });
  });

  it('gives other rows no **+**', () => {
    expect(addableTrack(base({ kind: 'show' }))).toBeNull();
    expect(addableTrack(base({ kind: 'recording' }))).toBeNull();
  });
});
