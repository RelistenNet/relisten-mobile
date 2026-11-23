import Realm from 'realm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system', () => ({
  Paths: { document: '/tmp', join: (...parts: string[]) => parts.join('/') },
}));
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));
vi.mock('@/relisten/events', () => ({ sharedStatsigClient: () => ({ logEvent: vi.fn() }) }));
vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }) },
}));

import type { RelistenApiClient } from '@/relisten/api/client';
import type { CatalogResolveResponse } from '@/relisten/api/catalog/resolve';
import type { TrackResource } from '@/relisten/api/catalog/resources';
import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { Artist } from '@/relisten/realm/models/artist';
import { Year } from '@/relisten/realm/models/year';
import { Show } from '@/relisten/realm/models/show';
import { Venue } from '@/relisten/realm/models/venue';
import { Tour } from '@/relisten/realm/models/tour';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import {
  Popularity,
  PopularityWindow,
  PopularityWindows,
} from '@/relisten/realm/models/popularity';
import { CATALOG_REALM_MODELS } from '@/relisten/realm/models/catalog';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import {
  Playlist,
  PLAYLIST_REALM_MODELS,
  PlaylistTrackAvailability,
} from '@/relisten/realm/models/playlists/playlist';
import { createPlaylist, readPlaylistSnapshot } from '@/relisten/playlists/playlist_repository';
import {
  addDownloadedTrack,
  addSearchTrack,
  TrackUnavailableError,
} from '@/relisten/playlists/playlist_search_add';
import { OnePendingAdd } from '@/relisten/playlists/one_pending_add';

const TEST_REALM_PATH = '/tmp/relisten-playlist-search-add-test.realm';
const config: Realm.Configuration = {
  path: TEST_REALM_PATH,
  schema: [
    Artist,
    Year,
    Show,
    Venue,
    Tour,
    Song,
    Source,
    SourceSet,
    SourceTrack,
    SourceTrackOfflineInfo,
    Popularity,
    PopularityWindow,
    PopularityWindows,
    ...CATALOG_REALM_MODELS,
    ...PLAYLIST_REALM_MODELS,
  ],
};

const timestamp = '2026-11-22T00:00:00.000Z';
const artistUuid = '00000000-0000-4000-8000-000000000001';
const yearUuid = '00000000-0000-4000-8000-000000000002';
const showUuid = '00000000-0000-4000-8000-000000000003';
const sourceUuid = '00000000-0000-4000-8000-000000000004';
const setUuid = '00000000-0000-4000-8000-000000000005';
const trackUuid = '00000000-0000-4000-8000-000000000006';

const artistId = encodeUuidCatalogId(artistUuid, 'artist');
const showId = encodeUuidCatalogId(showUuid, 'show');
const sourceId = encodeUuidCatalogId(sourceUuid, 'source');
const setId = encodeUuidCatalogId(setUuid, 'source_set');
const trackId = encodeUuidCatalogId(trackUuid, 'track');

function trackResource(change: Partial<TrackResource> = {}): TrackResource {
  return {
    id: trackId,
    source_id: sourceId,
    source_set_id: setId,
    show_id: showId,
    artist_id: artistId,
    track_position: 4,
    duration: 1060,
    title: 'Twist',
    slug: 'twist',
    mp3_url: 'https://example.com/twist.mp3',
    mp3_md5: null,
    flac_url: null,
    flac_md5: null,
    created_at: timestamp,
    updated_at: timestamp,
    normalization: { state: 'interpreted', reason: null, parts: [] },
    playable: true,
    ...change,
  };
}

/** A resolver reply for the one track, with the parents the mapper needs. */
function resolved(
  availability: 'available' | 'unavailable' | 'retired',
  track: TrackResource | null
): CatalogResolveResponse {
  return {
    references: [
      {
        kind: 'track',
        scheme: 'v4',
        id: trackId,
        artist_id: null,
        availability,
        target: availability === 'available' ? { kind: 'track', id: trackId } : null,
        reason: null,
      },
    ],
    entities: {
      artists: [
        {
          popularity: null,
          id: artistId,
          name: 'Phish',
          slug: 'phish',
          sort_name: 'Phish',
          musicbrainz_id: null,
          featured: 1,
          show_count: 1,
          source_count: 1,
          created_at: timestamp,
          updated_at: timestamp,
          features: '16646143',
          upstream_sources: [],
        },
      ],
      years: [
        {
          popularity: null,
          id: encodeUuidCatalogId(yearUuid, 'year'),
          artist_id: artistId,
          show_count: 1,
          source_count: 1,
          duration: 9000,
          avg_duration: 9000,
          avg_rating: 4.5,
          year: '2023',
          created_at: timestamp,
          updated_at: timestamp,
        },
      ],
      tours: [],
      imported_venues: [],
      imported_songs: [],
      artist_venues: [],
      shows: [
        {
          id: showId,
          artist_id: artistId,
          year_id: encodeUuidCatalogId(yearUuid, 'year'),
          tour_id: null,
          date: timestamp,
          display_date: '2023-04-19',
          avg_rating: 4.5,
          avg_duration: 9000,
          most_recent_source_updated_at: timestamp,
          has_soundboard_source: true,
          has_streamable_flac_source: false,
          source_count: 1,
          popularity: null,
          created_at: timestamp,
          updated_at: timestamp,
          imported_venue: null,
          artist_venue: null,
          year: null,
          tour: null,
          era: null,
        },
      ],
      sources: [
        {
          id: sourceId,
          artist_id: artistId,
          show_id: showId,
          display_date: '2023-04-19',
          is_soundboard: true,
          is_remaster: false,
          has_jamcharts: false,
          avg_rating: 4.5,
          num_reviews: 0,
          num_ratings: 0,
          avg_rating_weighted: 4.5,
          duration: 9000,
          upstream_identifier: 'phish2023-04-19',
          description: null,
          taper_notes: null,
          source: null,
          taper: null,
          transferrer: null,
          lineage: null,
          flac_type: 'NoFlac',
          review_count: 0,
          created_at: timestamp,
          updated_at: timestamp,
          imported_venue: null,
        },
      ],
      source_sets: [
        {
          id: setId,
          source_id: sourceId,
          artist_id: artistId,
          index: 0,
          is_encore: false,
          name: 'Set 1',
          created_at: timestamp,
          updated_at: timestamp,
        },
      ],
      tracks: track ? [track] : [],
      venues: [],
      songs: [],
    },
  } as unknown as CatalogResolveResponse;
}

function catalogReturning(...replies: CatalogResolveResponse[]) {
  const resolveCatalogReferences = vi.fn();
  for (const reply of replies) {
    resolveCatalogReferences.mockResolvedValueOnce({ data: reply });
  }
  return {
    api: { resolveCatalogReferences } as unknown as RelistenApiClient,
    resolveCatalogReferences,
  };
}

const isCurrent = () => true;

function seedUnavailableMarker() {
  realm.write(() => {
    realm.create(PlaylistTrackAvailability, {
      trackId,
      status: 'unavailable',
      checkedAt: new Date(timestamp),
    });
  });
}
let realm: Realm;
let playlistId: string;

function playlistTrackIds() {
  return [...readPlaylistSnapshot(realm, playlistId).entries.values()].map(
    (entry) => entry.trackId
  );
}

describe('addSearchTrack', () => {
  beforeEach(() => {
    Realm.deleteFile(config);
    realm = new Realm(config);
    playlistId = createPlaylist(realm, 'Tokyo jams', []).playlistId;
  });

  afterEach(() => {
    realm.close();
  });

  afterAll(() => {
    Realm.deleteFile(config);
  });

  it('refuses an available but unplayable file with no audio, before the mapper sees it', async () => {
    const { api } = catalogReturning(
      resolved('available', trackResource({ playable: false, mp3_url: null }))
    );

    await expect(
      addSearchTrack(realm, api, playlistId, trackId, { isCurrent })
    ).rejects.toBeInstanceOf(TrackUnavailableError);
    expect(playlistTrackIds()).toEqual([]);
    expect(realm.objectForPrimaryKey(SourceTrack, trackUuid)).toBeNull();
  });

  it('refuses a complete cached track that was withdrawn upstream (PHONE08)', async () => {
    // Cache the track as a normal, playable file first.
    const warm = catalogReturning(resolved('available', trackResource()));
    await addSearchTrack(realm, warm.api, playlistId, trackId, { isCurrent });
    const otherPlaylistId = createPlaylist(realm, 'Another', []).playlistId;
    expect(realm.objectForPrimaryKey(SourceTrack, trackUuid)?.mp3Url).toBeTruthy();

    const withdrawn = catalogReturning(resolved('unavailable', null));
    await expect(
      addSearchTrack(realm, withdrawn.api, otherPlaylistId, trackId, { isCurrent })
    ).rejects.toBeInstanceOf(TrackUnavailableError);
    // The warm cache didn't skip the check, and nothing was added.
    expect(withdrawn.resolveCatalogReferences).toHaveBeenCalledTimes(1);
    expect(readPlaylistSnapshot(realm, otherPlaylistId).entries.size).toBe(0);
  });

  it('adds a playable file once, with its row already complete', async () => {
    seedUnavailableMarker();
    const { api } = catalogReturning(resolved('available', trackResource()));

    await expect(addSearchTrack(realm, api, playlistId, trackId, { isCurrent })).resolves.toBe(
      'added'
    );

    expect(playlistTrackIds()).toEqual([trackId]);
    const track = realm.objectForPrimaryKey(SourceTrack, trackUuid);
    expect(track?.title).toBe('Twist');
    expect(track?.mp3Url).toBe('https://example.com/twist.mp3');
    // A stale "unavailable" marker would outrank the fresh metadata.
    expect(realm.objectForPrimaryKey(PlaylistTrackAvailability, trackId)).toBeNull();
  });

  it('treats an answer without a playable flag as retryable, not as a refusal', async () => {
    const { api } = catalogReturning(resolved('available', trackResource({ playable: undefined })));

    const attempt = addSearchTrack(realm, api, playlistId, trackId, { isCurrent });
    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.not.toBeInstanceOf(TrackUnavailableError);
    expect(playlistTrackIds()).toEqual([]);
  });

  it('adds nothing when the account changes while the check runs', async () => {
    const { api } = catalogReturning(resolved('available', trackResource()));

    await expect(
      addSearchTrack(realm, api, playlistId, trackId, { isCurrent: () => false })
    ).resolves.toBe('destination_changed');
    expect(playlistTrackIds()).toEqual([]);
    expect(realm.objectForPrimaryKey(SourceTrack, trackUuid)).toBeNull();
  });

  it('refuses a retired file and keeps an existing unavailable marker', async () => {
    seedUnavailableMarker();
    const { api } = catalogReturning(resolved('retired', null));

    await expect(
      addSearchTrack(realm, api, playlistId, trackId, { isCurrent })
    ).rejects.toBeInstanceOf(TrackUnavailableError);
    expect(realm.objectForPrimaryKey(PlaylistTrackAvailability, trackId)).not.toBeNull();
  });

  it('treats a redirected or contradictory reference as retryable', async () => {
    const redirected = resolved('available', trackResource());
    redirected.references[0] = {
      ...redirected.references[0],
      availability: 'redirected',
      target: {
        kind: 'track',
        id: encodeUuidCatalogId('00000000-0000-4000-8000-0000000000ff', 'track'),
      },
    };
    const goneButPresent = resolved('unavailable', trackResource());
    const { api } = catalogReturning(redirected, goneButPresent);

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = addSearchTrack(realm, api, playlistId, trackId, { isCurrent });
      await expect(result).rejects.toThrow();
      await expect(result).rejects.not.toBeInstanceOf(TrackUnavailableError);
    }
    expect(playlistTrackIds()).toEqual([]);
  });

  it('adds nothing to a playlist the listener can no longer edit', async () => {
    realm.write(() => {
      realm.objectForPrimaryKey(Playlist, playlistId)!.access = 'follower';
    });
    const { api } = catalogReturning(resolved('available', trackResource()));

    await expect(addSearchTrack(realm, api, playlistId, trackId, { isCurrent })).resolves.toBe(
      'destination_changed'
    );
    expect(playlistTrackIds()).toEqual([]);
  });

  it('adds nothing to another account’s playlist left on this device', async () => {
    realm.write(() => {
      realm.objectForPrimaryKey(Playlist, playlistId)!.libraryUserId = 'user_someone_else';
    });
    const { api } = catalogReturning(resolved('available', trackResource()));

    await expect(addSearchTrack(realm, api, playlistId, trackId, { isCurrent })).resolves.toBe(
      'destination_changed'
    );
  });

  it('ignores a second tap during a pending add, and asks about a later duplicate tap', async () => {
    const { api } = catalogReturning(
      resolved('available', trackResource()),
      resolved('available', trackResource())
    );
    const lock = new OnePendingAdd();
    const add = () =>
      lock.run(trackId, () => addSearchTrack(realm, api, playlistId, trackId, { isCurrent }));

    const [first, second] = await Promise.all([add(), add()]);
    expect([first, second]).toEqual(['added', 'busy']);
    expect(playlistTrackIds()).toEqual([trackId]);

    await expect(add()).resolves.toBe('duplicate');
    expect(playlistTrackIds()).toEqual([trackId]);
  });

  it('adds the file again once the listener confirms the duplicate', async () => {
    const { api } = catalogReturning(
      resolved('available', trackResource()),
      resolved('available', trackResource())
    );
    await addSearchTrack(realm, api, playlistId, trackId, { isCurrent });

    await expect(
      addSearchTrack(realm, api, playlistId, trackId, { isCurrent, allowDuplicate: true })
    ).resolves.toBe('added');
    expect(playlistTrackIds()).toEqual([trackId, trackId]);
  });

  it('releases the pending add when the add fails, and blocks other files meanwhile', async () => {
    const lock = new OnePendingAdd();
    let fail!: (error: Error) => void;
    const pending = lock.run('track_a', () => new Promise((_resolve, reject) => (fail = reject)));

    await expect(lock.run('track_b', async () => 'added')).resolves.toBe('busy');
    fail(new TrackUnavailableError('track_a'));
    await expect(pending).rejects.toBeInstanceOf(TrackUnavailableError);
    await expect(lock.run('track_b', async () => 'added')).resolves.toBe('added');
  });

  describe('a downloaded file, offline', () => {
    async function cacheTrack(status: SourceTrackOfflineInfoStatus) {
      const { api } = catalogReturning(resolved('available', trackResource()));
      const scratch = createPlaylist(realm, 'Scratch', []).playlistId;
      await addSearchTrack(realm, api, scratch, trackId, { isCurrent });
      const track = realm.objectForPrimaryKey(SourceTrack, trackUuid)!;
      realm.write(() => {
        track.offlineInfo = realm.create(SourceTrackOfflineInfo, {
          sourceTrackUuid: trackUuid,
          status,
          type: 1,
          queuedAt: new Date(timestamp),
        });
      });
      return track;
    }

    it('adds a completed download whose file is on disk, without asking the catalog', async () => {
      const track = await cacheTrack(SourceTrackOfflineInfoStatus.Succeeded);

      expect(
        addDownloadedTrack(realm, playlistId, track, trackId, { isCurrent, fileExists: () => true })
      ).toBe('added');
      expect(playlistTrackIds()).toEqual([trackId]);
    });

    it('refuses a download whose file is gone, or that never finished', async () => {
      const track = await cacheTrack(SourceTrackOfflineInfoStatus.Succeeded);
      expect(() =>
        addDownloadedTrack(realm, playlistId, track, trackId, {
          isCurrent,
          fileExists: () => false,
        })
      ).toThrow(TrackUnavailableError);

      realm.write(() => {
        track.offlineInfo!.status = SourceTrackOfflineInfoStatus.Downloading;
      });
      expect(() =>
        addDownloadedTrack(realm, playlistId, track, trackId, { isCurrent, fileExists: () => true })
      ).toThrow(TrackUnavailableError);
      expect(playlistTrackIds()).toEqual([]);
    });
  });
});
