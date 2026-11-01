/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('expo-file-system', () => ({
  Paths: {
    document: '/documents',
    join: (...parts: string[]) => parts.join('/'),
  },
}));
vi.mock('@realm/react', async () => {
  const { default: Realm } = await vi.importActual<{ default: typeof import('realm') }>('realm');

  return {
    Realm,
    createRealmContext: () => ({
      RealmProvider: undefined,
      useRealm: undefined,
      useObject: undefined,
      useQuery: undefined,
    }),
  };
});
vi.mock('@/relisten/events', () => ({ sharedStatsigClient: vi.fn() }));
vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock('@/relisten/util/profile_logging', () => ({
  isVerboseProfileLoggingEnabled: () => false,
}));
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));
vi.mock('@/relisten/accounts/auth/secure_tokens', () => ({
  clearRefreshTokenEnvelope: vi.fn(),
}));
vi.mock('@/relisten/accounts/auth/pkce_transaction', () => ({
  clearPendingAuthTransaction: vi.fn(),
}));

import { REALM_SCHEMA, REALM_SCHEMA_VERSION, realmConfig } from '@/relisten/realm/schema';
import { CatalogQueryState, V4_CATALOG_REALM_MODELS } from '@/relisten/realm/models/v4_catalog';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import {
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { PlayerRepeatState } from '@/relisten/player/player_modes';
import { PLAYER_STATE_SENTINEL, PlayerState } from '@/relisten/realm/models/player_state';
import {
  ACTIVE_ACCOUNT_SCOPE_ID,
  ActiveAccountScope,
} from '@/relisten/realm/models/accounts/active_account_scope';
import { UserFavorite } from '@/relisten/realm/models/library/user_favorite';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { Show } from '@/relisten/realm/models/show';
import { Tour } from '@/relisten/realm/models/tour';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';

const savedAt = new Date('2026-10-31T12:00:00Z');
const artistUuid = '00000000-0000-4000-8000-000000000001';
const yearUuid = '00000000-0000-4000-8000-000000000002';
const venueUuid = '00000000-0000-4000-8000-000000000003';
const tourUuid = '00000000-0000-4000-8000-000000000004';
const showUuid = '00000000-0000-4000-8000-000000000005';
const sourceUuid = '00000000-0000-4000-8000-000000000006';
const sourceSetUuid = '00000000-0000-4000-8000-000000000007';
const trackUuid = '00000000-0000-4000-8000-000000000008';
const userId = formatUuidTypedId('user', '01890a5d-ac96-774b-bcce-b302099a8051');
const sessionId = formatUuidTypedId('session', '01890a5d-ac96-774b-bcce-b302099a8052');
const favoriteId = formatUuidTypedId('favorite', '01890a5d-ac96-774b-bcce-b302099a8053');
const favoriteTargetId = formatUuidTypedId('track', trackUuid);

type RealmModel = { schema: Realm.ObjectSchema };

function schema17(): Realm.ObjectSchema[] {
  const v4Names = new Set(
    V4_CATALOG_REALM_MODELS.map((model) => (model as unknown as RealmModel).schema.name)
  );

  return REALM_SCHEMA.flatMap((model) => {
    const schema = (model as unknown as RealmModel).schema;
    if (v4Names.has(schema.name)) return [];

    const properties = { ...schema.properties };
    if (schema.name === 'Show') {
      delete properties.artistVenue;
      properties.yearUuid = { type: 'string', indexed: true };
    } else if (schema.name === 'SourceTrack') {
      delete properties.normalization;
    } else if (schema.name === 'Tour') {
      delete properties.showCount;
      properties.startDate = 'date';
      properties.endDate = 'date';
    }

    return [{ ...schema, properties }];
  });
}

class MigrationRealmFile {
  readonly directory = mkdtempSync(join(tmpdir(), 'relisten-v4-catalog-migration-'));
  readonly path = join(this.directory, 'catalog.realm');
  private readonly connections: Realm[] = [];

  async open(configuration: Omit<Realm.Configuration, 'path'>) {
    const realm = await Realm.open({ ...configuration, path: this.path });
    this.connections.push(realm);
    return realm;
  }

  async reopenCurrent() {
    const realm = await Realm.open({ ...realmConfig, path: this.path });
    this.connections.push(realm);
    return realm;
  }

  dispose() {
    for (const realm of this.connections) {
      if (!realm.isClosed) realm.close();
    }
    rmSync(this.directory, { force: true, recursive: true });
  }
}

function seedSchema17(realm: Realm) {
  realm.write(() => {
    const artist = realm.create('Artist', {
      uuid: artistUuid,
      createdAt: savedAt,
      updatedAt: savedAt,
      musicbrainzId: '',
      name: 'Migration Artist',
      featured: 1,
      slug: 'migration-artist',
      sortName: 'Migration Artist',
      featuresRaw: '{}',
      upstreamSourcesRaw: '[]',
      showCount: 1,
      sourceCount: 1,
    });
    const year = realm.create('Year', {
      uuid: yearUuid,
      createdAt: savedAt,
      updatedAt: savedAt,
      artistUuid,
      showCount: 1,
      sourceCount: 1,
      year: '2026',
    });
    const venue = realm.create('Venue', {
      uuid: venueUuid,
      createdAt: savedAt,
      updatedAt: savedAt,
      artistUuid,
      name: 'Migration Venue',
      location: 'San Francisco, CA',
      upstreamIdentifier: 'migration-venue',
      slug: 'migration-venue',
      sortName: 'Migration Venue',
      showsAtVenue: 1,
    });
    const tour = realm.create('Tour', {
      uuid: tourUuid,
      createdAt: savedAt,
      updatedAt: savedAt,
      artistUuid,
      startDate: savedAt,
      endDate: savedAt,
      name: 'Migration Tour',
      slug: 'migration-tour',
      upstreamIdentifier: 'migration-tour',
    });
    const show = realm.create('Show', {
      uuid: showUuid,
      artistUuid,
      yearUuid,
      venueUuid,
      tourUuid,
      createdAt: savedAt,
      updatedAt: savedAt,
      date: savedAt,
      avgRating: 9,
      displayDate: '2026-10-31',
      mostRecentSourceUpdatedAt: savedAt,
      hasSoundboardSource: false,
      hasStreamableFlacSource: false,
      sourceCount: 1,
      venue,
      tour,
      artist,
    });
    const sourceSet = realm.create('SourceSet', {
      uuid: sourceSetUuid,
      createdAt: savedAt,
      updatedAt: savedAt,
      artistUuid,
      sourceUuid,
      index: 0,
      isEncore: false,
      name: 'Set 1',
      sourceTracks: [],
    });
    const source = realm.create('Source', {
      uuid: sourceUuid,
      createdAt: savedAt,
      updatedAt: savedAt,
      artistUuid,
      showUuid,
      venueUuid,
      displayDate: '2026-10-31',
      isSoundboard: false,
      isRemaster: false,
      hasJamcharts: false,
      avgRating: 9,
      numReviews: 1,
      avgRatingWeighted: 9,
      duration: 300,
      upstreamIdentifier: 'migration-source',
      flacType: 'NoFlac',
      reviewCount: 1,
      linksRaw: '[]',
      sourceSets: [sourceSet],
      artist,
    });
    const offlineInfo = realm.create('SourceTrackOfflineInfo', {
      sourceTrackUuid: trackUuid,
      status: SourceTrackOfflineInfoStatus.Succeeded,
      type: SourceTrackOfflineInfoType.UserInitiated,
      queuedAt: savedAt,
      startedAt: savedAt,
      completedAt: savedAt,
      downloadedBytes: 123456,
      totalBytes: 123456,
      percent: 1,
    });
    const track = realm.create('SourceTrack', {
      uuid: trackUuid,
      createdAt: savedAt,
      updatedAt: savedAt,
      artistUuid,
      sourceUuid,
      sourceSetUuid,
      showUuid,
      trackPosition: 1,
      duration: 300,
      title: 'Migration Track',
      slug: 'migration-track',
      mp3Url: 'https://example.com/migration.mp3',
      offlineInfo,
      artist,
      year,
      show,
      source,
    });
    (sourceSet.sourceTracks as unknown as { push(value: unknown): void }).push(track);

    realm.create('PlaybackHistoryEntry', {
      uuid: 'history-entry',
      playbackFlags: 2,
      createdAt: savedAt,
      playbackStartedAt: savedAt,
      sourceTrack: track,
      artist,
      show,
      source,
    });
    realm.create('PlayerState', {
      id: PLAYER_STATE_SENTINEL,
      queueEntries: [{ id: 'queue-entry', sourceTrackUuid: trackUuid }],
      shuffleOrder: null,
      repeatMode: PlayerRepeatState.REPEAT_QUEUE,
      checkpoint: {
        entryId: 'queue-entry',
        elapsedSeconds: 42,
        durationSeconds: 300,
      },
      lastUpdatedAt: savedAt,
    });
    realm.create('ActiveAccountScope', {
      id: ACTIVE_ACCOUNT_SCOPE_ID,
      scopeId: userId,
      userId,
      generation: 7,
      nativeSessionId: sessionId,
      updatedAt: savedAt,
    });
    realm.create('UserFavorite', {
      favoriteId,
      scopeId: userId,
      targetKind: 'track',
      targetId: favoriteTargetId,
      acknowledgedPresent: true,
      effectivePresent: true,
      acknowledgedRevision: 9,
      lastLocalSequence: 1,
      createdAt: savedAt,
      updatedAt: savedAt,
    });
  });
}

function expectPreservedState(realm: Realm) {
  const track = realm.objectForPrimaryKey(SourceTrack, trackUuid)!;
  const show = realm.objectForPrimaryKey(Show, showUuid)!;
  const tour = realm.objectForPrimaryKey(Tour, tourUuid)!;
  const history = realm.objectForPrimaryKey(PlaybackHistoryEntry, 'history-entry')!;
  const player = realm.objectForPrimaryKey(PlayerState, PLAYER_STATE_SENTINEL)!;
  const account = realm.objectForPrimaryKey(ActiveAccountScope, ACTIVE_ACCOUNT_SCOPE_ID)!;
  const favorite = realm.objectForPrimaryKey(UserFavorite, favoriteId)!;

  expect(realm.schemaVersion).toBe(REALM_SCHEMA_VERSION);
  expect(track.uuid).toBe(trackUuid);
  expect(track.downloadedFileLocation()).toBe(`/documents/offline/${trackUuid}.mp3`);
  expect(track.offlineInfo).toMatchObject({
    sourceTrackUuid: trackUuid,
    status: SourceTrackOfflineInfoStatus.Succeeded,
    downloadedBytes: 123456,
    totalBytes: 123456,
  });
  expect(track.normalization).toBeNull();
  expect(track.artist.uuid).toBe(artistUuid);
  expect(track.year!.uuid).toBe(yearUuid);
  expect(track.show.uuid).toBe(showUuid);
  expect(track.source.uuid).toBe(sourceUuid);
  expect(show.artistVenue).toBeNull();
  expect(tour.startDate).toEqual(savedAt);
  expect(tour.endDate).toEqual(savedAt);
  expect(tour.showCount).toBe(0);
  expect(player.queueEntries.map((entry) => entry.toJSON())).toEqual([
    { id: 'queue-entry', sourceTrackUuid: trackUuid },
  ]);
  expect(player.checkpoint?.toJSON()).toEqual({
    entryId: 'queue-entry',
    elapsedSeconds: 42,
    durationSeconds: 300,
  });
  expect(history.sourceTrack.uuid).toBe(trackUuid);
  expect(history.artist.uuid).toBe(artistUuid);
  expect(history.show.uuid).toBe(showUuid);
  expect(history.source.uuid).toBe(sourceUuid);
  expect(account).toMatchObject({
    scopeId: userId,
    userId,
    generation: 7,
    nativeSessionId: sessionId,
  });
  expect(favorite).toMatchObject({
    favoriteId,
    scopeId: userId,
    targetKind: 'track',
    targetId: favoriteTargetId,
    acknowledgedPresent: true,
    effectivePresent: true,
  });
  expect(realm.objects(CatalogQueryState)).toHaveLength(0);
}

describe('v4 catalog Realm migration', () => {
  let file: MigrationRealmFile;

  beforeEach(() => {
    file = new MigrationRealmFile();
  });

  afterEach(() => {
    file.dispose();
  });

  it('adds overlays without changing imported, offline, player, history, or account identity', async () => {
    const schema17Realm = await file.open({ schema: schema17(), schemaVersion: 17 });
    seedSchema17(schema17Realm);
    schema17Realm.close();

    const migrated = await file.reopenCurrent();
    expectPreservedState(migrated);
  });
});
