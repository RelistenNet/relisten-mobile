import Realm from 'realm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: {
    extend: () => ({ info: vi.fn(), warn: vi.fn() }),
  },
}));

vi.mock('expo-file-system', () => ({
  Paths: {
    document: '/tmp',
    join: (...parts: string[]) => parts.join('/'),
  },
}));

const logStatsigEvent = vi.hoisted(() => vi.fn());

vi.mock('@/relisten/events', () => ({
  catalogStartupRepairEvent: (
    summary: Record<string, number>,
    durationMs: number,
    repairVersion: number
  ) => ({ eventName: 'catalog_startup_repair', summary, durationMs, repairVersion }),
  sharedStatsigClient: () => ({ logEvent: logStatsigEvent }),
}));

import {
  CATALOG_STARTUP_REPAIR_VERSION,
  CatalogStartupRepairState,
  repairCatalogAtStartup,
} from '@/relisten/realm/catalog_startup_repair';
import { Artist } from '@/relisten/realm/models/artist';
import { Year } from '@/relisten/realm/models/year';
import { Show } from '@/relisten/realm/models/show';
import { Venue } from '@/relisten/realm/models/venue';
import { Tour } from '@/relisten/realm/models/tour';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { SourceTrackOfflineInfo } from '@/relisten/realm/models/source_track_offline_info';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { PlayerState, PLAYER_STATE_SENTINEL } from '@/relisten/realm/models/player_state';
import {
  Popularity,
  PopularityWindow,
  PopularityWindows,
} from '@/relisten/realm/models/popularity';
import { FlacType } from '@/relisten/api/models/source';

const TEST_REALM_PATH = '/tmp/relisten-catalog-startup-repair-test.realm';
const now = new Date('2026-08-20T00:00:00.000Z');

const config: Realm.Configuration = {
  path: TEST_REALM_PATH,
  schemaVersion: 13,
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
    PlaybackHistoryEntry,
    PlayerState,
    Popularity,
    PopularityWindow,
    PopularityWindows,
    CatalogStartupRepairState,
  ],
};

function createArtist(realm: Realm) {
  return realm.create(Artist, {
    uuid: 'artist',
    createdAt: now,
    updatedAt: now,
    musicbrainzId: '',
    name: 'Artist',
    featured: 0,
    slug: 'artist',
    sortName: 'Artist',
    featuresRaw: '{}',
    upstreamSourcesRaw: '[]',
    showCount: 1,
    sourceCount: 1,
  });
}

function createYear(realm: Realm) {
  return realm.create(Year, {
    uuid: 'year',
    createdAt: now,
    updatedAt: now,
    artistUuid: 'artist',
    showCount: 1,
    sourceCount: 1,
    year: '2026',
  });
}

function createShow(realm: Realm, artist?: Artist, uuid = 'show', artistUuid = 'artist') {
  return realm.create(Show, {
    uuid,
    createdAt: now,
    updatedAt: now,
    artistUuid,
    yearUuid: 'year',
    date: now,
    avgRating: 0,
    displayDate: '2026-08-20',
    mostRecentSourceUpdatedAt: now,
    hasSoundboardSource: false,
    hasStreamableFlacSource: false,
    sourceCount: 1,
    isFavorite: true,
    artist,
  });
}

function createSource(realm: Realm, artist?: Artist): Source {
  return realm.create(Source, {
    uuid: 'source',
    createdAt: now,
    updatedAt: now,
    artistUuid: 'artist',
    showUuid: 'show',
    displayDate: '2026-08-20',
    isSoundboard: false,
    isRemaster: false,
    hasJamcharts: false,
    avgRating: 0,
    numReviews: 0,
    avgRatingWeighted: 0,
    upstreamIdentifier: 'source',
    flacType: FlacType.NoFlac,
    reviewCount: 0,
    linksRaw: '[]',
    isFavorite: true,
    artist,
  });
}

function createSourceSet(realm: Realm) {
  return realm.create(SourceSet, {
    uuid: 'source-set',
    createdAt: now,
    updatedAt: now,
    artistUuid: 'artist',
    sourceUuid: 'source',
    index: 0,
    isEncore: false,
    name: 'Set 1',
  });
}

function createSourceTrack(
  realm: Realm,
  relationships?: {
    artist: Artist;
    year: Year;
    show: Show;
    source: Source;
    offlineInfo?: SourceTrackOfflineInfo;
  },
  uuid = 'track',
  artistUuid = 'artist'
) {
  return realm.create(SourceTrack, {
    uuid,
    createdAt: now,
    updatedAt: now,
    artistUuid,
    sourceUuid: 'source',
    sourceSetUuid: 'source-set',
    showUuid: 'show',
    trackPosition: 1,
    title: 'Track',
    slug: 'track',
    mp3Url: 'https://example.com/track.mp3',
    isFavorite: true,
    ...relationships,
  });
}

function createOfflineInfo(realm: Realm) {
  return realm.create(SourceTrackOfflineInfo, {
    sourceTrackUuid: 'track',
    status: 4,
    type: 1,
    queuedAt: now,
  });
}

function createSong(realm: Realm, shows: Show | Show[]) {
  return realm.create(Song, {
    uuid: 'song',
    createdAt: now,
    updatedAt: now,
    artistUuid: 'artist',
    name: 'Song',
    slug: 'song',
    upstreamIdentifier: 'song',
    sortName: 'Song',
    showsPlayedAt: 1,
    shows: Array.isArray(shows) ? shows : [shows],
  });
}

function createHistory(
  realm: Realm,
  track: SourceTrack,
  artist: Artist,
  show: Show,
  source: Source
) {
  return realm.create(PlaybackHistoryEntry, {
    uuid: 'history',
    playbackFlags: 0,
    createdAt: now,
    playbackStartedAt: now,
    sourceTrack: track,
    artist,
    show,
    source,
  });
}

function createPlayerState(realm: Realm) {
  return realm.create(PlayerState, {
    id: PLAYER_STATE_SENTINEL,
    queueShuffleState: 0,
    queueRepeatState: 0,
    queueSourceTrackUuids: ['track'],
    queueSourceTrackShuffledUuids: ['track'],
    activeSourceTrackIndex: 0,
    activeSourceTrackShuffledIndex: 0,
    lastUpdatedAt: now,
  });
}

describe('catalog startup repair', () => {
  let realm: Realm;

  beforeEach(() => {
    logStatsigEvent.mockClear();
    if (Realm.exists(config)) Realm.deleteFile(config);
    realm = new Realm(config);
  });

  afterEach(() => {
    realm.close();
    if (Realm.exists(config)) Realm.deleteFile(config);
  });

  afterAll(() => {
    Realm.shutdown();
  });

  it('repairs known catalog links from scalar UUIDs', () => {
    let show!: Show;
    let source!: Source;
    let track!: SourceTrack;

    realm.write(() => {
      createArtist(realm);
      createYear(realm);
      show = createShow(realm);
      source = createSource(realm);
      track = createSourceTrack(realm);
    });

    expect(repairCatalogAtStartup(realm)).toEqual({
      repairedLinks: 6,
      tombstonedRows: 0,
      deletedLeafRows: 0,
      removedQueueEntries: 0,
    });
    expect(show.artist.uuid).toBe('artist');
    expect(source.artist.uuid).toBe('artist');
    expect(track.artist.uuid).toBe('artist');
    expect(track.year.uuid).toBe('year');
    expect(track.show.uuid).toBe('show');
    expect(track.source.uuid).toBe('source');
    expect(
      realm.objectForPrimaryKey(CatalogStartupRepairState, CATALOG_STARTUP_REPAIR_VERSION)
    ).not.toBeNull();
    expect(logStatsigEvent).toHaveBeenCalledTimes(1);

    realm.close();
    realm = new Realm(config);

    expect(repairCatalogAtStartup(realm)).toEqual({
      repairedLinks: 0,
      tombstonedRows: 0,
      deletedLeafRows: 0,
      removedQueueEntries: 0,
    });
    expect(logStatsigEvent).toHaveBeenCalledTimes(1);
  });

  it('quarantines irreparable catalog rows and deletes their leaf entry points', () => {
    let artist!: Artist;
    let show!: Show;
    let source!: Source;
    let sourceSet!: SourceSet;
    let track!: SourceTrack;
    let song!: Song;

    realm.write(() => {
      artist = createArtist(realm);
      const year = createYear(realm);
      show = createShow(realm, artist);
      source = createSource(realm, artist);
      sourceSet = createSourceSet(realm);
      const offlineInfo = createOfflineInfo(realm);
      track = createSourceTrack(realm, { artist, year, show, source, offlineInfo });
      source.sourceSets.push(sourceSet);
      sourceSet.sourceTracks.push(track);
      song = createSong(realm, show);
      createHistory(realm, track, artist, show, source);
      createPlayerState(realm);

      // Simulate an older build physically deleting a catalog target.
      realm.delete(artist);
    });

    const summary = repairCatalogAtStartup(realm);
    expect(summary).toEqual({
      repairedLinks: 0,
      tombstonedRows: 3,
      deletedLeafRows: 2,
      removedQueueEntries: 1,
    });
    expect(logStatsigEvent).toHaveBeenCalledWith({
      eventName: 'catalog_startup_repair',
      summary,
      durationMs: expect.any(Number),
      repairVersion: CATALOG_STARTUP_REPAIR_VERSION,
    });
    expect(show.deletedAt).toBeInstanceOf(Date);
    expect(source.deletedAt).toBeInstanceOf(Date);
    expect(track.deletedAt).toBeInstanceOf(Date);
    expect(show.isFavorite).toBe(false);
    expect(source.isFavorite).toBe(false);
    expect(track.isFavorite).toBe(false);
    expect(sourceSet.sourceTracks).toHaveLength(0);
    expect(song.shows).toHaveLength(0);
    expect(realm.objects(PlaybackHistoryEntry)).toHaveLength(0);
    expect(realm.objects(SourceTrackOfflineInfo)).toHaveLength(0);

    const playerState = PlayerState.defaultObject(realm)!;
    expect(playerState.queueSourceTrackUuids).toHaveLength(0);
    expect(playerState.queueSourceTrackShuffledUuids).toHaveLength(0);
    expect(playerState.activeSourceTrackIndex).toBeNull();
    expect(playerState.activeSourceTrackShuffledIndex).toBeNull();
    expect(repairCatalogAtStartup(realm)).toEqual({
      repairedLinks: 0,
      tombstonedRows: 0,
      deletedLeafRows: 0,
      removedQueueEntries: 0,
    });
  });

  it('removes multiple damaged memberships without removing healthy rows', () => {
    let sourceSet!: SourceSet;
    let song!: Song;

    realm.write(() => {
      const artist = createArtist(realm);
      const year = createYear(realm);
      const healthyShow = createShow(realm, artist);
      const source = createSource(realm, artist);
      sourceSet = createSourceSet(realm);
      const healthyTrack = createSourceTrack(realm, {
        artist,
        year,
        show: healthyShow,
        source,
      });
      const damagedShow1 = createShow(realm, undefined, 'damaged-show-1', 'missing-artist');
      const damagedShow2 = createShow(realm, undefined, 'damaged-show-2', 'missing-artist');
      const damagedTrack1 = createSourceTrack(
        realm,
        undefined,
        'damaged-track-1',
        'missing-artist'
      );
      const damagedTrack2 = createSourceTrack(
        realm,
        undefined,
        'damaged-track-2',
        'missing-artist'
      );

      sourceSet.sourceTracks.push(damagedTrack1, damagedTrack2, healthyTrack);
      song = createSong(realm, [damagedShow1, healthyShow, damagedShow2]);
    });

    expect(repairCatalogAtStartup(realm)).toEqual({
      repairedLinks: 0,
      tombstonedRows: 4,
      deletedLeafRows: 0,
      removedQueueEntries: 0,
    });
    expect(Array.from(sourceSet.sourceTracks, (track) => track.uuid)).toEqual(['track']);
    expect(Array.from(song.shows, (show) => show.uuid)).toEqual(['show']);
  });

  it('marks a clean Realm complete without emitting repair telemetry', () => {
    expect(repairCatalogAtStartup(realm)).toEqual({
      repairedLinks: 0,
      tombstonedRows: 0,
      deletedLeafRows: 0,
      removedQueueEntries: 0,
    });
    expect(
      realm.objectForPrimaryKey(CatalogStartupRepairState, CATALOG_STARTUP_REPAIR_VERSION)
    ).not.toBeNull();
    expect(logStatsigEvent).not.toHaveBeenCalled();
  });

  it('does not fail startup when repair telemetry throws', () => {
    realm.write(() => {
      createArtist(realm);
      createYear(realm);
      createShow(realm);
    });
    logStatsigEvent.mockImplementationOnce(() => {
      throw new Error('Statsig unavailable');
    });

    expect(() => repairCatalogAtStartup(realm)).not.toThrow();
    expect(
      realm.objectForPrimaryKey(CatalogStartupRepairState, CATALOG_STARTUP_REPAIR_VERSION)
    ).not.toBeNull();
    expect(realm.objectForPrimaryKey(Show, 'show')?.artist.uuid).toBe('artist');
  });
});
