/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixtureContext = vi.hoisted(() => ({
  realm: null as Realm | null,
  document: `/tmp/relisten-upgrade-media-${process.pid}`,
}));
vi.mock('react', () => ({
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (fn: unknown) => fn,
}));
vi.mock('@/relisten/api/context', () => ({ useRelistenApi: () => ({ apiClient: null }) }));
vi.mock('@/relisten/util/netinfo', () => ({ useShouldMakeNetworkRequests: () => false }));
vi.mock('@/relisten/realm/root_services', () => ({}));
vi.mock('@/relisten/util/routes', () => ({}));
vi.mock('@/relisten/realm/network_backed_behavior_hooks', () => ({
  useNetworkOnlyResults: () => ({ data: undefined, isNetworkLoading: false, refresh: () => {} }),
  useNetworkBackedBehavior: (behavior: {
    createLocalUpdatingResults(): { currentValue: unknown; tearDown(): void };
  }) => {
    const stream = behavior.createLocalUpdatingResults();
    const data = stream.currentValue;
    stream.tearDown();
    return { data, isNetworkLoading: false, refresh: vi.fn() };
  },
}));
vi.hoisted(() => vi.stubGlobal('__DEV__', true));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-file-system', () => ({
  Paths: {
    document: fixtureContext.document,
    join: (...parts: string[]) => parts.join('/'),
  },
}));
vi.mock('@realm/react', async () => {
  const { default: Realm } = await vi.importActual<{ default: typeof import('realm') }>('realm');

  return {
    Realm,
    createRealmContext: () => ({
      RealmProvider: undefined,
      useRealm: () => fixtureContext.realm,
      useObject: undefined,
      useQuery: (type: string, query: (rows: ReturnType<Realm['objects']>) => unknown) =>
        query(fixtureContext.realm!.objects(type)),
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

import frozen from './fixtures/schema_16.json';
import { REALM_SCHEMA_VERSION, realmConfig, prepareRealmForUse } from '../schema';
import { useSongs } from '../models/song_repo';
import { useVenues } from '../models/venue_repo';
import { useSongShows } from '../models/shows/song_shows_repo';
import { useVenueShows } from '../models/shows/venue_shows_repo';
import { SourceTrack } from '../models/source_track';
import {
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '../models/source_track_offline_info';
import { PlayerRepeatState } from '@/relisten/player/player_modes';
import { PLAYER_STATE_SENTINEL, PlayerState } from '../models/player_state';
import { ACTIVE_ACCOUNT_SCOPE_ID } from '../models/accounts/active_account_scope';
import { UserFavorite } from '../models/library/user_favorite';
import { PlaybackHistoryEntry } from '../models/history/playback_history_entry';
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
const songUuid = '00000000-0000-4000-8000-000000000009';
const userId = '01890a5d-ac96-774b-bcce-b302099a8051';
const sessionId = '01890a5d-ac96-774b-bcce-b302099a8052';
const rawFavoriteId = '01890a5d-ac96-774b-bcce-b302099a8053';
const audioBytes = readFileSync(new URL('./fixtures/offline_sample.mp3', import.meta.url));

function seedSchema16(realm: Realm) {
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
    realm.create('Song', {
      uuid: songUuid,
      artistUuid,
      createdAt: savedAt,
      updatedAt: savedAt,
      name: 'Cached Song',
      slug: 'cached-song',
      upstreamIdentifier: 'cached-song',
      sortName: 'Cached Song',
      showsPlayedAt: 1,
      shows: [show],
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
      downloadedBytes: audioBytes.length,
      totalBytes: audioBytes.length,
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
      queueEntries: [
        { id: 'first', sourceTrackUuid: trackUuid },
        { id: 'second', sourceTrackUuid: trackUuid },
      ],
      shuffleOrder: null,
      repeatMode: PlayerRepeatState.REPEAT_QUEUE,
      checkpoint: {
        entryId: 'second',
        elapsedSeconds: 42,
        durationSeconds: 300,
      },
      lastUpdatedAt: savedAt,
    });
    realm.create('ActiveAccountScope', {
      id: ACTIVE_ACCOUNT_SCOPE_ID,
      scopeId: 'anonymous',
      userUuid: userId,
      generation: 7,
      nativeSessionId: sessionId,
      updatedAt: savedAt,
    });
    realm.create('UserFavorite', {
      favoriteUuid: rawFavoriteId,
      scopeId: 'anonymous',
      catalogType: 'source_track',
      catalogUuid: trackUuid,
      acknowledgedPresent: true,
      effectivePresent: true,
      acknowledgedRevision: 9,
      lastLocalSequence: 1,
      createdAt: savedAt,
      updatedAt: savedAt,
    });
  });
}

describe('direct schema-16 offline upgrade', () => {
  let directory: string;
  let realm: Realm | undefined;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-upgrade16-'));
  });
  afterEach(() => {
    fixtureContext.realm = null;
    realm?.close();
    rmSync(directory, { recursive: true, force: true });
    rmSync(fixtureContext.document, { recursive: true, force: true });
  });
  it.each([false, true])(
    'preserves offline data without fetch bookkeeping (normalization=%s)',
    async (normalization) => {
      const path = join(directory, 'data.realm');
      realm = await Realm.open({
        path,
        schemaVersion: frozen.schemaVersion,
        schema: frozen.schema as Realm.ObjectSchema[],
      });
      seedSchema16(realm);
      realm.write(() => {
        realm!.objects('Artist')[0].featuresRaw = JSON.stringify({
          songs: true,
          years: true,
          multiple_sources: true,
          normalization,
        });
      });
      const audioPath = join(fixtureContext.document, 'offline', `${trackUuid}.mp3`);
      mkdirSync(join(fixtureContext.document, 'offline'), { recursive: true });
      writeFileSync(audioPath, audioBytes);
      const digest = createHash('sha256').update(audioBytes).digest('hex');
      realm.close();
      realm = await Realm.open({ ...realmConfig, path });
      await prepareRealmForUse(realm);
      fixtureContext.realm = realm;
      expect(realm.schemaVersion).toBe(REALM_SCHEMA_VERSION);
      // Canonical browse stays empty offline until canonical data is fetched; imported data survives.
      expect(useSongs(artistUuid).data.map((item) => item.uuid)).toEqual(
        normalization ? [] : [formatUuidTypedId('imported_song', songUuid)]
      );
      expect(useVenues(artistUuid).data).toHaveLength(normalization ? 0 : 1);
      expect(realm.objectForPrimaryKey('Song', songUuid)).toMatchObject({ deletedAt: null });
      expect(realm.objectForPrimaryKey('Venue', venueUuid)).toMatchObject({ deletedAt: null });
      expect(useSongShows(artistUuid, songUuid).data.shows).toEqual([]);
      expect(useSongShows(artistUuid, songUuid).data.isAvailable).toBe(false);
      expect(useVenueShows(artistUuid, venueUuid).data.shows.map((show) => show.uuid)).toEqual([
        showUuid,
      ]);
      const track = realm.objectForPrimaryKey(SourceTrack, trackUuid)!;
      expect(track.downloadedFileLocation()).toBe(audioPath);
      expect(track.playable(false)).toBe(true);
      expect(createHash('sha256').update(readFileSync(audioPath)).digest('hex')).toBe(digest);
      expect(
        realm
          .objectForPrimaryKey(PlayerState, PLAYER_STATE_SENTINEL)
          ?.queueEntries.map((entry) => entry.toJSON())
      ).toEqual([
        { id: 'first', sourceTrackUuid: trackUuid },
        { id: 'second', sourceTrackUuid: trackUuid },
      ]);
      expect(
        realm.objectForPrimaryKey(PlayerState, PLAYER_STATE_SENTINEL)?.checkpoint?.toJSON()
      ).toEqual({ entryId: 'second', elapsedSeconds: 42, durationSeconds: 300 });
      expect(
        realm.objectForPrimaryKey(PlaybackHistoryEntry, 'history-entry')?.sourceTrack.uuid
      ).toBe(trackUuid);
      expect(realm.objects(UserFavorite)[0]).toMatchObject({
        scopeId: 'anonymous',
        targetKind: 'track',
        targetId: formatUuidTypedId('track', trackUuid),
        effectivePresent: true,
      });
    }
  );
});
