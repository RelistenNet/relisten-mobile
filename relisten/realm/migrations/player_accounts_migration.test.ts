/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlayerRepeatState, PlayerShuffleState } from '@/relisten/player/player_modes';
import { PLAYER_STATE_SCHEMAS, PlayerState } from '../models/player_state';
import { migratePlayerState } from '../models/player_state_migration';
import {
  ACCOUNT_REALM_MODELS,
  ACTIVE_ACCOUNT_SCOPE_ID,
  ANONYMOUS_ACCOUNT_SCOPE_ID,
  ActiveAccountScope,
} from '../models/accounts';
import {
  FAVORITE_REALM_MODELS,
  FavoriteMutation,
  FavoriteMutationState,
  FavoriteSyncState,
  UserFavorite,
} from '../models/library';
import { migrateLegacyFavoritesToAnonymous } from './favorite_migration';

// Supply the platform CSPRNG through Node; Realm and both migrations run normally.
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const savedAt = new Date('2026-10-20T12:00:00Z');
const playerStateId = 'player_state';
const accountScopeId = 'account:user-A';

// The account builds retained this format after main adopted embedded records.
const accountsPlayerState: Realm.ObjectSchema = {
  name: 'PlayerState',
  primaryKey: 'id',
  properties: {
    id: 'string',
    queueShuffleState: 'int',
    queueRepeatState: 'int',
    queueSourceTrackUuids: 'string[]',
    queueSourceTrackShuffledUuids: 'string[]',
    activeSourceTrackIndex: 'int?',
    activeSourceTrackShuffledIndex: 'int?',
    lastUpdatedAt: 'date',
    progress: 'float?',
    duration: 'float?',
    elapsed: 'float?',
  },
};
const catalogTrack: Realm.ObjectSchema = {
  name: 'SourceTrack',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    duration: 'double?',
    mp3Url: 'string?',
    isFavorite: { type: 'bool', default: false },
  },
};
const scopedModels = [...ACCOUNT_REALM_MODELS, ...FAVORITE_REALM_MODELS];

/** Own temporary files and connections so each upgrade is also checked after reopen. */
class MigrationRealmFile {
  private directory = mkdtempSync(join(tmpdir(), 'relisten-player-accounts-'));
  private path = join(this.directory, 'migration.realm');
  private connections: Realm[] = [];

  async open(configuration: Omit<Realm.Configuration, 'path'>) {
    const realm = await Realm.open({ ...configuration, path: this.path });
    this.connections.push(realm);
    return realm;
  }

  async migrateAndReopen() {
    const configuration: Omit<Realm.Configuration, 'path'> = {
      schemaVersion: 16,
      schema: [...PLAYER_STATE_SCHEMAS, catalogTrack, ...scopedModels],
      onMigration: (oldRealm, newRealm) => {
        migratePlayerState(oldRealm, newRealm);
        migrateLegacyFavoritesToAnonymous(oldRealm, newRealm);
      },
    };
    const migrated = await this.open(configuration);
    migrated.close();
    return this.open(configuration);
  }

  dispose() {
    for (const realm of this.connections) {
      if (!realm.isClosed) {
        realm.close();
      }
    }
    rmSync(this.directory, { recursive: true, force: true });
  }
}

describe('player and accounts Realm upgrades', () => {
  let file: MigrationRealmFile;

  beforeEach(() => {
    file = new MigrationRealmFile();
  });
  afterEach(() => {
    file.dispose();
  });

  it('keeps main schema 14 queue identities and imports its catalog favorites', async () => {
    const main = await file.open({
      schemaVersion: 14,
      schema: [
        ...PLAYER_STATE_SCHEMAS,
        { ...catalogTrack, properties: { ...catalogTrack.properties, mp3Url: 'string' } },
      ],
    });
    const savedPlayer = {
      queueEntries: [
        { id: 'first-A', sourceTrackUuid: 'A' },
        { id: 'second-A', sourceTrackUuid: 'A' },
      ],
      shuffleOrder: { entryIds: ['second-A', 'first-A'] },
      repeatMode: PlayerRepeatState.REPEAT_TRACK,
      checkpoint: { entryId: 'second-A', elapsedSeconds: 42, durationSeconds: 300 },
      lastUpdatedAt: savedAt,
    };
    PlayerState.upsert(main, savedPlayer);
    main.write(() => {
      main.create('SourceTrack', {
        uuid: 'A',
        mp3Url: 'https://example.com/A.mp3',
        isFavorite: true,
      });
    });
    main.close();

    const reopened = await file.migrateAndReopen();

    expect(PlayerState.defaultObject(reopened)?.toJSON()).toEqual({
      id: playerStateId,
      ...savedPlayer,
    });
    expect(reopened.objects(UserFavorite)).toHaveLength(1);
    expect(reopened.objects(UserFavorite)[0]).toMatchObject({
      scopeId: ANONYMOUS_ACCOUNT_SCOPE_ID,
      catalogType: 'source_track',
      catalogUuid: 'A',
      acknowledgedPresent: true,
      effectivePresent: true,
    });
  });

  it.each([14, 15])(
    'migrates accounts schema %i playback without duplicating favorites or losing pending work',
    async (schemaVersion) => {
      const accounts = await file.open({
        schemaVersion,
        schema: [accountsPlayerState, catalogTrack, ...scopedModels],
      });
      accounts.write(() => {
        accounts.create('PlayerState', {
          id: playerStateId,
          queueShuffleState: PlayerShuffleState.SHUFFLE_ON,
          queueRepeatState: PlayerRepeatState.REPEAT_QUEUE,
          queueSourceTrackUuids: ['A', 'B'],
          queueSourceTrackShuffledUuids: ['B', 'A'],
          activeSourceTrackIndex: 0,
          activeSourceTrackShuffledIndex: 1,
          lastUpdatedAt: savedAt,
          duration: 300,
          elapsed: 42,
        });
        // Accounts permits FLAC-only rows and keeps flags as compatibility mirrors.
        accounts.create('SourceTrack', { uuid: 'A', mp3Url: null, isFavorite: true });
        accounts.create(ActiveAccountScope, {
          id: ACTIVE_ACCOUNT_SCOPE_ID,
          scopeId: accountScopeId,
          userUuid: 'user-A',
          generation: 5,
          updatedAt: savedAt,
        });
        accounts.create(UserFavorite, {
          favoriteUuid: 'favorite-A',
          scopeId: accountScopeId,
          catalogType: 'source_track',
          catalogUuid: 'A',
          acknowledgedPresent: false,
          effectivePresent: true,
          lastLocalSequence: 7,
          createdAt: savedAt,
          updatedAt: savedAt,
        });
        accounts.create(FavoriteMutation, {
          mutationUuid: 'mutation-A',
          scopeId: accountScopeId,
          favoriteUuid: 'favorite-A',
          catalogType: 'source_track',
          catalogUuid: 'A',
          desiredPresent: true,
          localSequence: 7,
          state: FavoriteMutationState.Pending,
          createdAt: savedAt,
          updatedAt: savedAt,
        });
        accounts.create(FavoriteSyncState, {
          syncStateUuid: 'sync-A',
          scopeId: accountScopeId,
          libraryCursor: 'saved-cursor',
          nextLocalSequence: 8,
          createdAt: savedAt,
          updatedAt: savedAt,
        });
      });
      const savedScope = accounts.objects(ActiveAccountScope)[0].toJSON();
      const savedFavorite = accounts.objects(UserFavorite)[0].toJSON();
      const savedMutation = accounts.objects(FavoriteMutation)[0].toJSON();
      const savedSync = accounts.objects(FavoriteSyncState)[0].toJSON();
      accounts.close();

      const reopened = await file.migrateAndReopen();
      const player = PlayerState.defaultObject(reopened)!;
      const [trackA, trackB] = player.queueEntries;

      expect(player.queueEntries.map((entry) => entry.sourceTrackUuid)).toEqual(['A', 'B']);
      expect(player.shuffleOrder?.entryIds.slice()).toEqual([trackB.id, trackA.id]);
      expect(player.checkpoint).toMatchObject({
        entryId: trackA.id,
        elapsedSeconds: 42,
        durationSeconds: 300,
      });
      expect(player.repeatMode).toBe(PlayerRepeatState.REPEAT_QUEUE);
      expect(reopened.objects(ActiveAccountScope)[0].toJSON()).toEqual(savedScope);
      expect(reopened.objects(UserFavorite)).toHaveLength(1);
      expect(reopened.objects(UserFavorite)[0].toJSON()).toEqual(savedFavorite);
      expect(reopened.objects(FavoriteMutation)[0].toJSON()).toEqual(savedMutation);
      expect(reopened.objects(FavoriteSyncState)[0].toJSON()).toEqual(savedSync);
      expect(reopened.objectForPrimaryKey('SourceTrack', 'A')?.mp3Url).toBeNull();
    }
  );
});
