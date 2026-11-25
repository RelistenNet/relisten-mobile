import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { playlistCardHref, searchTapTarget } from './search_routes';
import type { SearchPlaylistCard } from './search_types';
import {
  artist as catalogArtist,
  importedVenue,
  performanceRow,
  recordingRow,
  reviewRow,
  sequenceRow,
  showRow,
  songRow,
  source,
  venue,
  UUIDS,
  uuid,
} from './search_test_fixtures';

const { artist: ARTIST, show: SHOW, source: SOURCE, track: TRACK } = UUIDS;

const artist = { uuid: ARTIST };

describe('searchTapTarget', () => {
  it('opens a performance at its exact source, focused on the file, not played', () => {
    expect(searchTapTarget(performanceRow, artist, '(search)')).toEqual({
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

  it('opens a recording and its review at their nested source ID', () => {
    for (const row of [recordingRow, reviewRow]) {
      const target = searchTapTarget(row, artist, '(search)');
      expect(target.kind === 'push' && target.href).toMatchObject({
        pathname: '/relisten/tabs/(search)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
        params: { showUuid: SHOW, sourceUuid: SOURCE, exactSource: '1' },
      });
    }
  });

  it('opens a passage at its first file', () => {
    const target = searchTapTarget(sequenceRow, artist, '(search)');
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { showUuid: SHOW, sourceUuid: SOURCE, focusTrackUuid: TRACK, exactSource: '1' },
    });
  });

  it('opens a show without a named source through the source settings', () => {
    expect(searchTapTarget(showRow, artist, '(search)')).toEqual({
      kind: 'show',
      showUuid: SHOW,
    });
  });

  it('opens a show at the source that matched the search', () => {
    const target = searchTapTarget({ ...showRow, source }, artist, '(search)');
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { showUuid: SHOW, sourceUuid: SOURCE, exactSource: '1' },
    });
  });

  it('sends a shared venue to the shared page with no artist, and an imported one to the artist’s', () => {
    const shared = { kind: 'venue', key: `venue:${venue.id}`, venue } as const;
    expect(searchTapTarget(shared, null, '(search)')).toEqual({
      kind: 'push',
      href: {
        pathname: '/relisten/tabs/(search)/venue/[venueId]/',
        params: { venueId: 'venue_bvhfka1g' },
      },
    });

    const imported = { ...shared, venue: importedVenue, artist: catalogArtist };
    const target = searchTapTarget(imported, artist, '(search)');
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { artistUuid: ARTIST, venueUuid: uuid(5), venueKind: 'imported_venue' },
    });
  });

  it('passes canonical and imported song IDs to the song page as they are', () => {
    const id = encodeUuidCatalogId(uuid(9), 'imported_song');
    const imported = {
      id,
      artist_id: catalogArtist.id,
      name: 'Twist',
      normalized_song_id: null,
      slug: 'twist',
      upstream_identifier: 'twist',
      setlist_show_count: 4,
      created_at: catalogArtist.created_at,
      updated_at: catalogArtist.updated_at,
    };
    for (const song of [songRow.song, imported]) {
      const target = searchTapTarget({ ...songRow, song }, artist, '(search)');
      expect(target.kind === 'push' && target.href).toMatchObject({
        params: { songUuid: song.id },
      });
    }
  });
});

describe('playlistCardHref', () => {
  const card: SearchPlaylistCard = {
    id: 'playlist_x',
    name: 'Jams',
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
    expect(
      playlistCardHref({ ...card, public_code: undefined }, false, '(search)')
    ).toBeUndefined();
  });
});
