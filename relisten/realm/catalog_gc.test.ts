/// <reference types="node" />

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Realm from 'realm';
import { afterEach, describe, expect, it } from 'vitest';

import { FlacType } from '@/relisten/api/models/source';
import { runColdStartCatalogGarbageCollection } from '@/relisten/realm/catalog_gc';
import { Artist } from '@/relisten/realm/models/artist';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { PlayerState } from '@/relisten/realm/models/player_state';
import {
  Popularity,
  PopularityWindow,
  PopularityWindows,
} from '@/relisten/realm/models/popularity';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { Tour } from '@/relisten/realm/models/tour';
import { Venue } from '@/relisten/realm/models/venue';
import { Year } from '@/relisten/realm/models/year';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-04-01T00:00:00.000Z');
const MATURE_RETIREMENT = new Date('2026-01-01T00:00:00.000Z');

const catalogTestSchema = [
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
];

const openRealms: Realm[] = [];
const tempDirectories: string[] = [];

function temporaryRealm() {
  const directory = mkdtempSync(join(tmpdir(), 'relisten-catalog-gc-'));
  tempDirectories.push(directory);
  const realm = new Realm({
    path: join(directory, 'test.realm'),
    schema: catalogTestSchema,
    schemaVersion: 1,
  });
  openRealms.push(realm);
  return realm;
}

function runGc(realm: Realm, batchLimit = 250) {
  return runColdStartCatalogGarbageCollection(realm, {
    now: NOW,
    gracePeriodMs: 30 * DAY_MS,
    batchLimit,
    scanLimitPerModel: 100,
    auditGraph: false,
  });
}

function createRetiredVenue(realm: Realm, uuid: string, artistUuid = 'missing-artist') {
  realm.create(Venue, {
    uuid,
    createdAt: MATURE_RETIREMENT,
    updatedAt: MATURE_RETIREMENT,
    artistUuid,
    name: uuid,
    location: 'Test Location',
    upstreamIdentifier: uuid,
    slug: uuid,
    sortName: uuid,
    showsAtVenue: 0,
    retiredAt: MATURE_RETIREMENT,
    isFavorite: false,
  });
}

function createOfflineInfo(realm: Realm, sourceTrackUuid: string, deletedAt?: Date) {
  return realm.create(SourceTrackOfflineInfo, {
    sourceTrackUuid,
    status: SourceTrackOfflineInfoStatus.Succeeded,
    type: SourceTrackOfflineInfoType.UserInitiated,
    queuedAt: MATURE_RETIREMENT,
    downloadedBytes: 1,
    totalBytes: 1,
    percent: 1,
    deletedAt,
  });
}

function createRetiredTrack(realm: Realm, uuid: string, offlineInfo?: SourceTrackOfflineInfo) {
  const linkedOfflineInfo = offlineInfo ?? createOfflineInfo(realm, uuid, MATURE_RETIREMENT);
  return realm.create(SourceTrack, {
    uuid,
    createdAt: MATURE_RETIREMENT,
    updatedAt: MATURE_RETIREMENT,
    retiredAt: MATURE_RETIREMENT,
    artistUuid: 'missing-artist',
    sourceUuid: 'missing-source',
    sourceSetUuid: 'missing-source-set',
    showUuid: 'missing-show',
    trackPosition: 1,
    title: uuid,
    slug: uuid,
    mp3Url: `https://example.test/${uuid}.mp3`,
    isFavorite: false,
    offlineInfo: linkedOfflineInfo,
  });
}

function createHistoryGraph(realm: Realm) {
  const artist = realm.create(Artist, {
    uuid: 'history-artist',
    createdAt: MATURE_RETIREMENT,
    updatedAt: MATURE_RETIREMENT,
    musicbrainzId: '',
    name: 'History Artist',
    featured: 0,
    slug: 'history-artist',
    sortName: 'History Artist',
    featuresRaw: '{}',
    upstreamSourcesRaw: '[]',
    showCount: 1,
    sourceCount: 1,
    isFavorite: false,
  });
  const show = realm.create(Show, {
    uuid: 'history-show',
    artistUuid: artist.uuid,
    yearUuid: 'history-year',
    createdAt: MATURE_RETIREMENT,
    updatedAt: MATURE_RETIREMENT,
    date: MATURE_RETIREMENT,
    avgRating: 0,
    displayDate: '2026-01-01',
    mostRecentSourceUpdatedAt: MATURE_RETIREMENT,
    hasSoundboardSource: false,
    hasStreamableFlacSource: false,
    sourceCount: 1,
    artist,
    isFavorite: false,
  });
  const source = realm.create(Source, {
    uuid: 'history-source',
    createdAt: MATURE_RETIREMENT,
    updatedAt: MATURE_RETIREMENT,
    artistUuid: artist.uuid,
    showUuid: show.uuid,
    displayDate: '2026-01-01',
    isSoundboard: false,
    isRemaster: false,
    hasJamcharts: false,
    avgRating: 0,
    numReviews: 0,
    avgRatingWeighted: 0,
    upstreamIdentifier: 'history-source',
    flacType: FlacType.NoFlac,
    reviewCount: 0,
    linksRaw: '[]',
    artist,
    sourceSets: [],
    isFavorite: false,
  });
  return { artist, show, source };
}

afterEach(() => {
  for (const realm of openRealms.splice(0)) {
    if (!realm.isClosed) realm.close();
  }
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('cold-start catalog garbage collection', () => {
  it('physically collects a mature unreferenced tombstone', () => {
    const realm = temporaryRealm();
    realm.write(() => createRetiredVenue(realm, 'unreferenced'));

    const result = runGc(realm);

    expect(result.collected.Venue).toBe(1);
    expect(result.totalCollected).toBe(1);
    expect(realm.objectForPrimaryKey('Venue', 'unreferenced')).toBeNull();
  });

  it('keeps a retired descendant of an active favorite', () => {
    const realm = temporaryRealm();
    realm.write(() => {
      realm.create(Artist, {
        uuid: 'favorite-artist',
        createdAt: MATURE_RETIREMENT,
        updatedAt: MATURE_RETIREMENT,
        musicbrainzId: '',
        name: 'Favorite Artist',
        featured: 0,
        slug: 'favorite-artist',
        sortName: 'Favorite Artist',
        featuresRaw: '{}',
        upstreamSourcesRaw: '[]',
        showCount: 0,
        sourceCount: 0,
        isFavorite: true,
      });
      createRetiredVenue(realm, 'favorite-venue', 'favorite-artist');
    });

    const result = runGc(realm);

    expect(result.totalCollected).toBe(0);
    expect(result.models.Venue.blockers['favorite-root-closure']).toBe(1);
    expect(realm.objectForPrimaryKey('Venue', 'favorite-venue')).not.toBeNull();
  });

  it('keeps a track referenced by active durable queue state', () => {
    const realm = temporaryRealm();
    realm.write(() => {
      createRetiredTrack(realm, 'queued-track');
      realm.create(PlayerState, {
        id: 'player_state',
        queueShuffleState: 0,
        queueRepeatState: 0,
        queueSourceTrackUuids: ['queued-track'],
        queueSourceTrackShuffledUuids: [],
        lastUpdatedAt: NOW,
      });
    });

    const result = runGc(realm);

    expect(result.totalCollected).toBe(0);
    expect(result.models.SourceTrack.blockers['player-state-queue']).toBe(1);
    expect(realm.objectForPrimaryKey('SourceTrack', 'queued-track')).not.toBeNull();
  });

  it('keeps a track referenced by active playback history', () => {
    const realm = temporaryRealm();
    realm.write(() => {
      const { artist, show, source } = createHistoryGraph(realm);
      const sourceTrack = createRetiredTrack(realm, 'history-track');
      sourceTrack.artist = artist;
      sourceTrack.show = show;
      sourceTrack.source = source;
      realm.create(PlaybackHistoryEntry, {
        uuid: 'history-entry',
        playbackFlags: 0,
        createdAt: MATURE_RETIREMENT,
        playbackStartedAt: MATURE_RETIREMENT,
        sourceTrack,
        artist,
        show,
        source,
      });
    });

    const result = runGc(realm);

    expect(result.totalCollected).toBe(0);
    expect(result.models.SourceTrack.blockers['playback-history']).toBe(1);
    expect(realm.objectForPrimaryKey('SourceTrack', 'history-track')).not.toBeNull();
  });

  it('keeps a track with active offline state', () => {
    const realm = temporaryRealm();
    realm.write(() => {
      const offlineInfo = createOfflineInfo(realm, 'offline-track');
      createRetiredTrack(realm, 'offline-track', offlineInfo);
    });

    const result = runGc(realm);

    expect(result.totalCollected).toBe(0);
    expect(result.models.SourceTrack.blockers['offline-info-link']).toBe(1);
    expect(realm.objectForPrimaryKey('SourceTrack', 'offline-track')).not.toBeNull();
  });

  it('never physically deletes more than the configured batch limit', () => {
    const realm = temporaryRealm();
    realm.write(() => {
      for (let index = 0; index < 12; index += 1) {
        createRetiredVenue(realm, `venue-${index}`);
      }
    });

    const result = runGc(realm, 9);

    expect(result.totalCollected).toBe(9);
    expect(result.collected.Venue).toBe(9);
    expect(realm.objects('Venue')).toHaveLength(3);
  });

  it('rejects a nonzero batch too small to reserve every model class', () => {
    const realm = temporaryRealm();

    expect(() => runGc(realm, 8)).toThrow(
      'batchLimit must be 0 or at least 9 so every catalog model has a reserved GC slot'
    );
  });

  it('makes progress on later model classes under a SourceTrack backlog', () => {
    const realm = temporaryRealm();
    realm.write(() => {
      for (let index = 0; index < 20; index += 1) {
        createRetiredTrack(realm, `backlog-track-${index}`);
      }
      createRetiredVenue(realm, 'later-venue');
    });

    const result = runGc(realm, 9);

    expect(result.totalCollected).toBe(9);
    expect(result.collected.SourceTrack).toBe(8);
    expect(result.collected.Venue).toBe(1);
    expect(realm.objects(SourceTrack)).toHaveLength(12);
    expect(realm.objectForPrimaryKey(Venue, 'later-venue')).toBeNull();
  });
});
