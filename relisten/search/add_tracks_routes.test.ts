import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { addableTrack, addTracksTapTarget } from './add_tracks_routes';
import {
  artist,
  importedVenue,
  performanceRow,
  recordingRow,
  sequenceRow,
  showRow,
  songRow,
  source,
  track,
  venue,
} from './search_test_fixtures';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ARTIST = uuid(1);
const SHOW = uuid(2);
const SOURCE = uuid(3);
const TRACK = uuid(4);
const PLAYLIST = 'playlist_01m836fykfetx92xm6rwxdtt3s';

describe('addTracksTapTarget', () => {
  it('narrows in place for an artist', () => {
    const row = { kind: 'artist', key: `artist:${artist.id}`, artist } as const;
    expect(addTracksTapTarget(row, PLAYLIST)).toEqual({
      kind: 'narrow-artist',
      artistId: artist.id,
      label: 'Phish',
    });
  });

  it('narrows a tour to its shows under its artist', () => {
    const row = {
      kind: 'tour',
      key: 'tour:summer2000',
      artist,
      tour: {
        id: encodeUuidCatalogId(uuid(10), 'tour'),
        artist_id: artist.id,
        name: 'Summer Tour 2000',
        show_count: 12,
        start_date: null,
        end_date: null,
        slug: 'summer-tour-2000',
        upstream_identifier: 'summer2000',
        created_at: artist.created_at,
        updated_at: artist.updated_at,
      },
    } as const;

    expect(addTracksTapTarget(row, PLAYLIST)).toEqual({
      kind: 'narrow-tour',
      label: 'Summer Tour 2000',
      artistId: artist.id,
      artistLabel: 'Phish',
    });
  });

  it('opens a performance at its exact source, focused on the file and its song', () => {
    expect(addTracksTapTarget(performanceRow, PLAYLIST)).toEqual({
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
    const target = addTracksTapTarget(showRow, PLAYLIST);
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { playlistId: PLAYLIST, showUuid: SHOW, sourceUuid: 'initial' },
    });
  });

  it('opens the matching source for a show that represents a recording', () => {
    const target = addTracksTapTarget({ ...showRow, source }, PLAYLIST);
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { playlistId: PLAYLIST, showUuid: SHOW, sourceUuid: SOURCE },
    });
  });

  it('opens a recording at that source and a passage at its first file', () => {
    const recording = addTracksTapTarget(recordingRow, PLAYLIST);
    expect(recording.kind === 'push' && recording.href).toMatchObject({
      params: { showUuid: SHOW, sourceUuid: SOURCE },
    });

    const passage = addTracksTapTarget(sequenceRow, PLAYLIST);
    expect(passage.kind === 'push' && passage.href).toMatchObject({
      params: { sourceUuid: SOURCE, focusTrackUuid: TRACK },
    });
  });

  it("lists a venue's shows, under its artist only when the venue has one", () => {
    const shared = addTracksTapTarget({ kind: 'venue', key: `venue:${venue.id}`, venue }, PLAYLIST);
    expect(shared).toEqual({
      kind: 'push',
      href: {
        pathname: '/relisten/add-tracks/shows',
        params: { playlistId: PLAYLIST, kind: 'venue', venueId: 'venue_bvhfka1g' },
      },
    });

    const imported = addTracksTapTarget(
      { kind: 'venue', key: `venue:${importedVenue.id}`, venue: importedVenue, artist },
      PLAYLIST
    );
    expect(imported.kind === 'push' && imported.href).toMatchObject({
      params: { kind: 'venue', venueId: importedVenue.id, artistUuid: ARTIST },
    });
  });

  it("lists a song's shows under its artist", () => {
    const target = addTracksTapTarget(songRow, PLAYLIST);
    expect(target.kind === 'push' && target.href).toMatchObject({
      pathname: '/relisten/add-tracks/shows',
      params: { kind: 'song', songId: 'song_hf5bcx7b', artistUuid: ARTIST },
    });
  });
});

describe('addableTrack', () => {
  it("adds a performance's preview file", () => {
    expect(addableTrack(performanceRow)).toEqual({
      trackId: encodeUuidCatalogId(TRACK, 'track'),
      title: track.title,
    });
  });

  it('still adds by track identity if the performance has no catalog song', () => {
    const raw = { ...performanceRow, key: `performance:track:${track.id}`, performance: undefined };
    expect(addableTrack(raw)?.trackId).toBe(track.id);
    const target = addTracksTapTarget(raw, PLAYLIST);
    expect(target.kind === 'push' && target.href).toMatchObject({
      params: { showUuid: SHOW, sourceUuid: SOURCE, focusTrackUuid: TRACK },
    });
    expect(target.kind === 'push' && target.href).not.toMatchObject({
      params: { focusSongId: expect.any(String) },
    });
  });

  it('does not offer an add for an explicitly unplayable track', () => {
    expect(
      addableTrack({ ...performanceRow, preview_track: { ...track, playable: false } })
    ).toBeNull();
  });

  it('gives other rows no **+**', () => {
    expect(addableTrack(showRow)).toBeNull();
    expect(addableTrack(recordingRow)).toBeNull();
  });
});
