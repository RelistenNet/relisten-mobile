/// <reference types="node" />

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as Sentry from '@sentry/react-native';
import Realm from 'realm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const blockedOfflineFiles = vi.hoisted(() => new Set<string>());

vi.mock('expo-file-system', () => ({
  File: class {
    constructor(private path: string) {}

    get exists() {
      return blockedOfflineFiles.has(this.path);
    }

    delete() {
      if (blockedOfflineFiles.has(this.path)) throw new Error('blocked test file');
    }
  },
  Paths: {
    document: '/tmp',
    join: (...parts: string[]) => parts.join('/'),
  },
}));

import { FlacType } from '@/relisten/api/models/source';
import { repairCatalogIntegrityAtStartup } from '@/relisten/realm/catalog_integrity';
import { activeCatalogObjectForPrimaryKey } from '@/relisten/realm/catalog_retirement';
import { Artist } from '@/relisten/realm/models/artist';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { cleanupPlaybackHistoryAtStartup } from '@/relisten/realm/models/history/playback_history_lifecycle';
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
import { PlayerState } from '@/relisten/realm/models/player_state';
import { LastFmScrobbleEntry } from '@/relisten/realm/models/lastfm_scrobble_entry';
import { Tour } from '@/relisten/realm/models/tour';
import { Venue } from '@/relisten/realm/models/venue';
import { Year } from '@/relisten/realm/models/year';
import { collectTransientTombstonesAtStartup } from '@/relisten/realm/transient_tombstone_lifecycle';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const openRealms: Realm[] = [];
const tempDirectories: string[] = [];

function temporaryRealm() {
  const directory = mkdtempSync(join(tmpdir(), 'relisten-catalog-integrity-'));
  tempDirectories.push(directory);
  const realm = new Realm({
    path: join(directory, 'test.realm'),
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
      LastFmScrobbleEntry,
      Popularity,
      PopularityWindow,
      PopularityWindows,
    ],
  });
  openRealms.push(realm);
  return realm;
}

function createArtist(realm: Realm) {
  return realm.create(Artist, {
    uuid: 'artist',
    createdAt: NOW,
    updatedAt: NOW,
    musicbrainzId: '',
    name: 'Artist',
    featured: 0,
    slug: 'artist',
    sortName: 'Artist',
    featuresRaw: '{}',
    upstreamSourcesRaw: '[]',
    showCount: 1,
    sourceCount: 1,
    isFavorite: false,
  });
}

function createYear(realm: Realm) {
  return realm.create(Year, {
    uuid: 'year',
    createdAt: NOW,
    updatedAt: NOW,
    artistUuid: 'artist',
    showCount: 1,
    sourceCount: 1,
    year: '2026',
  });
}

function createShow(realm: Realm, artist?: Artist) {
  return realm.create(Show, {
    uuid: 'show',
    artistUuid: 'artist',
    yearUuid: 'year',
    createdAt: NOW,
    updatedAt: NOW,
    date: NOW,
    avgRating: 0,
    displayDate: '2026-08-20',
    mostRecentSourceUpdatedAt: NOW,
    hasSoundboardSource: false,
    hasStreamableFlacSource: false,
    sourceCount: 1,
    artist,
    isFavorite: false,
  });
}

function createSource(realm: Realm, artist?: Artist) {
  return realm.create(Source, {
    uuid: 'source',
    createdAt: NOW,
    updatedAt: NOW,
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
    sourceSets: [],
    artist,
    isFavorite: false,
  });
}

function createTrack(
  realm: Realm,
  links: { artist?: Artist; year?: Year; show?: Show; source?: Source } = {}
) {
  return realm.create(SourceTrack, {
    uuid: 'track',
    createdAt: NOW,
    updatedAt: NOW,
    artistUuid: 'artist',
    sourceUuid: 'source',
    sourceSetUuid: 'set',
    showUuid: 'show',
    trackPosition: 1,
    title: 'Track',
    slug: 'track',
    mp3Url: 'https://example.test/track.mp3',
    isFavorite: false,
    ...links,
  });
}

afterEach(() => {
  for (const realm of openRealms.splice(0)) {
    if (!realm.isClosed) realm.close();
  }
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
  blockedOfflineFiles.clear();
  vi.clearAllMocks();
});

describe('catalog integrity repair', () => {
  it('relinks every required semantic link from surviving scalar UUIDs', () => {
    const realm = temporaryRealm();
    let artist!: Artist;
    let year!: Year;
    let show!: Show;
    let source!: Source;
    let track!: SourceTrack;
    realm.write(() => {
      artist = createArtist(realm);
      year = createYear(realm);
      show = createShow(realm);
      source = createSource(realm);
      track = createTrack(realm);
    });

    const result = repairCatalogIntegrityAtStartup(realm);

    expect(result.totalRelinked).toBe(6);
    expect(result.totalQuarantinedRoots).toBe(0);
    expect(show.artist.uuid).toBe(artist.uuid);
    expect(source.artist.uuid).toBe(artist.uuid);
    expect(track.artist.uuid).toBe(artist.uuid);
    expect(track.year.uuid).toBe(year.uuid);
    expect(track.show.uuid).toBe(show.uuid);
    expect(track.source.uuid).toBe(source.uuid);
  });

  it('quarantines an unrecoverable track and reports one aggregate diagnostic', () => {
    const realm = temporaryRealm();
    let track!: SourceTrack;
    realm.write(() => {
      const artist = createArtist(realm);
      const show = createShow(realm, artist);
      const source = createSource(realm, artist);
      track = createTrack(realm, { artist, show, source });
    });

    const result = repairCatalogIntegrityAtStartup(realm);

    expect(result.newlyQuarantinedRoots.SourceTrack).toBe(1);
    expect(track.isValid()).toBe(true);
    expect(track.retiredAt).toBeInstanceOf(Date);
    expect(track.retirementReason).toBe('catalog-integrity:missing-year');
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Unrecoverable Realm catalog graphs were quarantined',
      expect.anything()
    );
  });

  it('rejects and reports an incomplete point read', () => {
    const realm = temporaryRealm();
    realm.write(() => {
      createArtist(realm);
      createShow(realm);
    });

    expect(
      activeCatalogObjectForPrimaryKey(realm, Show, 'show', 'test.incomplete-show')
    ).toBeUndefined();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Structurally incomplete Realm catalog object was accessed',
      expect.anything()
    );
  });
});

describe('playback history startup quarantine', () => {
  it('keeps a newly malformed tombstone for one reboot before bounded collection', () => {
    const realm = temporaryRealm();
    let entry!: PlaybackHistoryEntry;
    let deferredEntry!: PlaybackHistoryEntry;
    realm.write(() => {
      const artist = createArtist(realm);
      const show = createShow(realm, artist);
      const source = createSource(realm, artist);
      const track = createTrack(realm, { artist, show, source });
      entry = realm.create(PlaybackHistoryEntry, {
        uuid: 'history',
        playbackFlags: 0,
        createdAt: NOW,
        playbackStartedAt: NOW,
        sourceTrack: track,
        artist,
        show,
        source,
      });
      deferredEntry = realm.create(PlaybackHistoryEntry, {
        uuid: 'history-deferred',
        playbackFlags: 0,
        createdAt: NOW,
        playbackStartedAt: NOW,
        sourceTrack: track,
        artist,
        show,
        source,
      });
    });

    const firstBoot = cleanupPlaybackHistoryAtStartup(realm, {
      batchLimit: 1,
      quarantineBatchLimit: 1,
      now: NOW,
    });

    expect(firstBoot.newlyQuarantined).toBe(1);
    expect(firstBoot.quarantineDeferred).toBe(1);
    expect(firstBoot.physicallyDeleted).toBe(0);
    expect(entry.isValid()).toBe(true);
    expect(entry.deletedAt).toEqual(NOW);
    expect(deferredEntry.deletedAt).toBeNull();

    const secondBoot = cleanupPlaybackHistoryAtStartup(realm, { batchLimit: 1 });
    expect(secondBoot.physicallyDeleted).toBe(1);
    expect(secondBoot.newlyQuarantined).toBe(1);
    expect(entry.isValid()).toBe(false);
    expect(deferredEntry.deletedAt).toBeInstanceOf(Date);
  });
});

describe('transient tombstone startup collection', () => {
  it('rotates failed offline-file cleanup behind later tombstones', () => {
    const realm = temporaryRealm();
    const deletedAt = new Date('2026-01-01T00:00:00.000Z');
    realm.write(() => {
      for (const sourceTrackUuid of ['blocked-a', 'blocked-b', 'collectable-c']) {
        realm.create(SourceTrackOfflineInfo, {
          sourceTrackUuid,
          status: SourceTrackOfflineInfoStatus.Failed,
          type: SourceTrackOfflineInfoType.UserInitiated,
          queuedAt: deletedAt,
          deletedAt,
        });
      }
    });
    blockedOfflineFiles.add('/tmp/offline/blocked-a.mp3');
    blockedOfflineFiles.add('/tmp/offline/blocked-b.mp3');

    const firstBoot = collectTransientTombstonesAtStartup(realm, {
      batchLimitPerModel: 2,
      now: NOW,
    });
    expect(firstBoot.sourceTrackOfflineInfos).toBe(0);
    expect(firstBoot.deferred.sourceTrackOfflineInfos).toBe(3);

    const secondBoot = collectTransientTombstonesAtStartup(realm, {
      batchLimitPerModel: 2,
      now: new Date('2026-08-21T12:00:00.000Z'),
    });
    expect(secondBoot.sourceTrackOfflineInfos).toBe(1);
    expect(realm.objectForPrimaryKey(SourceTrackOfflineInfo, 'collectable-c')).toBeNull();
    expect(realm.objectForPrimaryKey(SourceTrackOfflineInfo, 'blocked-a')).not.toBeNull();
    expect(realm.objectForPrimaryKey(SourceTrackOfflineInfo, 'blocked-b')).not.toBeNull();
  });
});
