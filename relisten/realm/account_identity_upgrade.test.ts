/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ACCOUNT_REALM_MODELS,
  AccountProfile,
  ActiveAccountScope,
  PendingUsernameCommand,
} from '@/relisten/realm/models/accounts';
import { AccountIdentityUpgradeState } from '@/relisten/realm/models/accounts/account_identity_upgrade_state';
import {
  FAVORITE_REALM_MODELS,
  AnonymousFavoriteImport,
  AnonymousFavoriteImportState,
  FavoriteMutation,
  FavoriteMutationState,
  FavoriteSyncState,
  UserFavorite,
} from '@/relisten/realm/models/library';
import { PLAYER_STATE_SCHEMAS, PlayerState } from '@/relisten/realm/models/player_state';
import { SourceTrackOfflineInfo } from '@/relisten/realm/models/source_track_offline_info';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import {
  stageLegacyAccountIdentityFields,
  upgradeTypedAccountIdentity,
} from './account_identity_upgrade';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';
import { PlayerRepeatState } from '@/relisten/player/player_modes';
import { migrateLegacyFavoritesToAnonymous } from '@/relisten/realm/migrations/favorite_migration';
import { anonymousFavoriteSourceFingerprint } from '@/relisten/library/anonymous_favorite_import_fingerprint';

vi.mock('@/relisten/accounts/auth/secure_tokens', () => ({
  clearRefreshTokenEnvelope: vi.fn(),
}));
vi.mock('@/relisten/accounts/auth/pkce_transaction', () => ({
  clearPendingAuthTransaction: vi.fn(),
}));
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const savedAt = new Date('2026-10-31T12:00:00Z');
const userUuid = '019a0000-0000-7000-8000-000000000001';
const secondUserUuid = '019a0000-0000-7000-8000-000000000010';
const favoriteUuid = '019a0000-0000-7000-8000-000000000002';
const targetUuid = '777f627f-442e-9a6f-a366-ac734827dcc5';

const catalogSchemas: Realm.ObjectSchema[] = [
  {
    name: 'Artist',
    primaryKey: 'uuid',
    properties: { uuid: 'string' },
  },
  {
    name: 'Show',
    primaryKey: 'uuid',
    properties: { uuid: 'string' },
  },
  {
    name: 'Source',
    primaryKey: 'uuid',
    properties: { uuid: 'string' },
  },
  {
    name: 'SourceTrack',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      offlineInfo: 'SourceTrackOfflineInfo?',
    },
  },
];

const legacyAccountSchemas: Realm.ObjectSchema[] = [
  {
    name: 'ActiveAccountScope',
    primaryKey: 'id',
    properties: {
      id: 'string',
      scopeId: 'string',
      userUuid: 'string?',
      generation: 'int',
      nativeSessionId: 'string?',
      blockedNativeSessionId: 'string?',
      updatedAt: 'date',
    },
  },
  {
    name: 'AccountProfile',
    primaryKey: 'scopeId',
    properties: {
      scopeId: 'string',
      userUuid: 'string',
      username: 'string',
      usernameVersion: 'int',
      usernameReviewNeeded: 'bool',
      usernameReviewedAt: 'date?',
      usernameChangeAvailableAt: 'date?',
      nativeSessionId: 'string',
      lastSyncedAt: 'date',
    },
  },
  {
    name: 'PendingUsernameCommand',
    primaryKey: 'scopeId',
    properties: {
      scopeId: 'string',
      commandUuid: 'string',
      expectedUsernameVersion: 'int',
      username: 'string',
      createdAt: 'date',
    },
  },
  {
    name: 'UserFavorite',
    primaryKey: 'favoriteUuid',
    properties: {
      favoriteUuid: 'string',
      scopeId: 'string',
      catalogType: 'string',
      catalogUuid: 'string',
      acknowledgedPresent: 'bool',
      effectivePresent: 'bool',
      acknowledgedRevision: 'int?',
      lastLocalSequence: 'int',
      serverCreatedAt: 'date?',
      serverUpdatedAt: 'date?',
      createdAt: 'date',
      updatedAt: 'date',
    },
  },
  {
    name: 'FavoriteMutation',
    primaryKey: 'mutationUuid',
    properties: {
      mutationUuid: 'string',
      scopeId: 'string',
      favoriteUuid: 'string',
      catalogType: 'string',
      catalogUuid: 'string',
      desiredPresent: 'bool',
      localSequence: 'int',
      state: 'string',
      importUuid: 'string?',
      attemptCount: 'int',
      nextAttemptAt: 'date?',
      requestStartedAt: 'date?',
      lastErrorCode: 'string?',
      lastErrorMessage: 'string?',
      createdAt: 'date',
      updatedAt: 'date',
    },
  },
  FavoriteSyncState.schema,
  AnonymousFavoriteImport.schema,
];

class UpgradeRealmFile {
  readonly directory = mkdtempSync(join(tmpdir(), 'relisten-account-upgrade-'));
  readonly path = join(this.directory, 'upgrade.realm');
  private realms: Realm[] = [];

  async open() {
    const realm = await Realm.open({
      path: this.path,
      schemaVersion: 17,
      schema: [
        ...ACCOUNT_REALM_MODELS,
        AccountIdentityUpgradeState,
        ...FAVORITE_REALM_MODELS,
        ...PLAYER_STATE_SCHEMAS,
        ...catalogSchemas,
        SourceTrackOfflineInfo,
        PlaybackHistoryEntry,
      ],
    });
    this.realms.push(realm);
    return realm;
  }

  async openLegacy() {
    const realm = await Realm.open({
      path: this.path,
      schemaVersion: 16,
      schema: legacyAccountSchemas,
    });
    this.realms.push(realm);
    return realm;
  }

  async openPreFavorites() {
    const realm = await Realm.open({
      path: this.path,
      schemaVersion: 14,
      schema: [
        {
          name: 'SourceTrack',
          primaryKey: 'uuid',
          properties: { uuid: 'string', isFavorite: 'bool' },
        },
      ],
    });
    this.realms.push(realm);
    return realm;
  }

  async openMigrated() {
    const realm = await Realm.open({
      path: this.path,
      schemaVersion: 17,
      schema: [...ACCOUNT_REALM_MODELS, AccountIdentityUpgradeState, ...FAVORITE_REALM_MODELS],
      onMigration: stageLegacyAccountIdentityFields,
    });
    this.realms.push(realm);
    return realm;
  }

  async openMigratedPreFavorites() {
    const realm = await Realm.open({
      path: this.path,
      schemaVersion: 17,
      schema: [
        {
          name: 'SourceTrack',
          primaryKey: 'uuid',
          properties: { uuid: 'string', isFavorite: 'bool' },
        },
        ...ACCOUNT_REALM_MODELS,
        AccountIdentityUpgradeState,
        ...FAVORITE_REALM_MODELS,
      ],
      onMigration: (oldRealm, newRealm) => {
        stageLegacyAccountIdentityFields(oldRealm, newRealm);
        migrateLegacyFavoritesToAnonymous(oldRealm, newRealm, savedAt);
      },
    });
    this.realms.push(realm);
    return realm;
  }

  dispose() {
    for (const realm of this.realms) {
      if (!realm.isClosed) {
        realm.close();
      }
    }
    rmSync(this.directory, { recursive: true, force: true });
  }
}

function seedAccountState(realm: Realm) {
  const scopeId = `user:${userUuid}`;

  realm.write(() => {
    realm.create(ActiveAccountScope, {
      id: '__ACTIVE_ACCOUNT_SCOPE__',
      scopeId,
      userId: userUuid,
      generation: 4,
      nativeSessionId: '019a0000-0000-7000-8000-000000000003',
      updatedAt: savedAt,
    });
    realm.create(AccountProfile, {
      scopeId,
      userId: userUuid,
      username: 'alpha',
      usernameVersion: 1,
      usernameReviewNeeded: false,
      nativeSessionId: '019a0000-0000-7000-8000-000000000003',
      lastSyncedAt: savedAt,
    });
    realm.create(PendingUsernameCommand, {
      scopeId,
      commandId: '019a0000-0000-7000-8000-000000000004',
      expectedUsernameVersion: 1,
      username: 'pending',
      createdAt: savedAt,
    });
    realm.create(UserFavorite, {
      favoriteId: '019a0000-0000-7000-8000-000000000005',
      scopeId,
      targetKind: 'artist',
      targetId: targetUuid,
      acknowledgedPresent: true,
      effectivePresent: true,
      lastLocalSequence: 1,
      createdAt: savedAt,
      updatedAt: savedAt,
    });
    realm.create(FavoriteMutation, {
      mutationId: '019a0000-0000-7000-8000-000000000006',
      scopeId,
      favoriteId: '019a0000-0000-7000-8000-000000000005',
      targetKind: 'artist',
      targetId: targetUuid,
      desiredPresent: true,
      localSequence: 1,
      state: FavoriteMutationState.InFlight,
      importUuid: 'import-pending',
      createdAt: savedAt,
      updatedAt: savedAt,
    });
    realm.create(FavoriteSyncState, {
      syncStateUuid: 'sync-state',
      scopeId,
      libraryCursor: 'old-cursor',
      nextLocalSequence: 2,
      createdAt: savedAt,
      updatedAt: savedAt,
    });
    realm.create(AnonymousFavoriteImport, {
      importUuid: 'import-pending',
      installationUuid: 'installation',
      destinationScopeId: scopeId,
      sourceFingerprint: anonymousFavoriteSourceFingerprint([
        { targetKind: 'venue', targetId: targetUuid },
      ]),
      state: AnonymousFavoriteImportState.Importing,
      sourceFavoriteCount: 1,
      createdAt: savedAt,
      updatedAt: savedAt,
    });
    realm.create(AnonymousFavoriteImport, {
      importUuid: 'import-complete',
      installationUuid: 'installation',
      destinationScopeId: `user:${secondUserUuid}`,
      sourceFingerprint: anonymousFavoriteSourceFingerprint([
        { targetKind: 'venue', targetId: targetUuid },
      ]),
      state: AnonymousFavoriteImportState.Completed,
      sourceFavoriteCount: 1,
      createdAt: savedAt,
      updatedAt: savedAt,
      completedAt: savedAt,
    });
  });
}

function seedPreservedState(realm: Realm) {
  realm.write(() => {
    realm.create(UserFavorite, {
      favoriteId: favoriteUuid,
      scopeId: 'anonymous',
      targetKind: 'venue',
      targetId: targetUuid,
      acknowledgedPresent: true,
      effectivePresent: true,
      lastLocalSequence: 0,
      createdAt: savedAt,
      updatedAt: savedAt,
    });

    const artist = realm.create('Artist', { uuid: 'artist-catalog-key' });
    const show = realm.create('Show', { uuid: 'show-catalog-key' });
    const source = realm.create('Source', { uuid: 'source-catalog-key' });
    const offlineInfo = realm.create(SourceTrackOfflineInfo, {
      sourceTrackUuid: targetUuid,
      status: 4,
      type: 1,
      queuedAt: savedAt,
      downloadedBytes: 123,
      totalBytes: 123,
      percent: 1,
    });
    const track = realm.create('SourceTrack', { uuid: targetUuid, offlineInfo });
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
  });

  PlayerState.upsert(realm, {
    queueEntries: [{ id: 'queue-entry', sourceTrackUuid: targetUuid }],
    shuffleOrder: { entryIds: ['queue-entry'] },
    repeatMode: PlayerRepeatState.REPEAT_QUEUE,
    checkpoint: { entryId: 'queue-entry', elapsedSeconds: 42, durationSeconds: 300 },
    lastUpdatedAt: savedAt,
  });
}

describe('typed account identity upgrade', () => {
  let file: UpgradeRealmFile;

  beforeEach(() => {
    file = new UpgradeRealmFile();
  });
  afterEach(() => {
    file.dispose();
  });

  it('waits for protected storage and retries without exposing partially cleared Realm state', async () => {
    const realm = await file.open();
    seedAccountState(realm);
    seedPreservedState(realm);

    await expect(
      upgradeTypedAccountIdentity(realm, () => Promise.reject(new Error('device locked')))
    ).rejects.toThrow('device locked');

    expect(realm.objects(AccountProfile)).toHaveLength(1);
    expect(realm.objects(AccountIdentityUpgradeState)).toHaveLength(0);

    await upgradeTypedAccountIdentity(realm, () => Promise.resolve());

    expect(realm.objects(AccountProfile)).toHaveLength(0);
    expect(realm.objects(ActiveAccountScope)).toHaveLength(0);
    expect(realm.objects(PendingUsernameCommand)).toHaveLength(0);
    expect(realm.objects(FavoriteMutation)).toHaveLength(0);
    expect(realm.objects(FavoriteSyncState)).toHaveLength(0);
    expect(realm.objects(AccountIdentityUpgradeState)).toHaveLength(1);
  });

  it('retries safely when Realm conversion is interrupted after protected storage clears', async () => {
    const realm = await file.open();
    seedAccountState(realm);
    realm.write(() => {
      realm.create(UserFavorite, {
        favoriteId: favoriteUuid,
        scopeId: 'anonymous',
        targetKind: 'artist',
        targetId: 'invalid-target',
        acknowledgedPresent: true,
        effectivePresent: true,
        lastLocalSequence: 0,
        createdAt: savedAt,
        updatedAt: savedAt,
      });
    });
    const cleanup = vi.fn(() => Promise.resolve());

    await expect(upgradeTypedAccountIdentity(realm, cleanup)).rejects.toThrow(
      'Expected a canonical UUID'
    );

    expect(realm.objects(AccountIdentityUpgradeState)).toHaveLength(0);
    expect(realm.objects(AccountProfile)).toHaveLength(1);
    expect(realm.objects(UserFavorite)).toHaveLength(2);

    realm.write(() => {
      realm.objectForPrimaryKey(UserFavorite, favoriteUuid)!.targetId = targetUuid;
    });
    await upgradeTypedAccountIdentity(realm, cleanup);

    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(realm.objects(AccountIdentityUpgradeState)).toHaveLength(1);
    expect(realm.objects(AccountProfile)).toHaveLength(0);
  });

  it('stages renamed schema-16 fields before the gated reset converts anonymous membership', async () => {
    const legacy = await file.openLegacy();
    const scopeId = `user:${userUuid}`;
    legacy.write(() => {
      legacy.create('ActiveAccountScope', {
        id: '__ACTIVE_ACCOUNT_SCOPE__',
        scopeId,
        userUuid,
        generation: 3,
        nativeSessionId: '019a0000-0000-7000-8000-000000000003',
        updatedAt: savedAt,
      });
      legacy.create('AccountProfile', {
        scopeId,
        userUuid,
        username: 'alpha',
        usernameVersion: 1,
        usernameReviewNeeded: false,
        nativeSessionId: '019a0000-0000-7000-8000-000000000003',
        lastSyncedAt: savedAt,
      });
      legacy.create('PendingUsernameCommand', {
        scopeId,
        commandUuid: '019a0000-0000-7000-8000-000000000004',
        expectedUsernameVersion: 1,
        username: 'pending',
        createdAt: savedAt,
      });
      legacy.create('UserFavorite', {
        favoriteUuid,
        scopeId: 'anonymous',
        catalogType: 'source_track',
        catalogUuid: targetUuid,
        acknowledgedPresent: true,
        effectivePresent: true,
        lastLocalSequence: 0,
        createdAt: savedAt,
        updatedAt: savedAt,
      });
      legacy.create('UserFavorite', {
        favoriteUuid: '019a0000-0000-7000-8000-000000000003',
        scopeId,
        catalogType: 'artist',
        catalogUuid: targetUuid,
        acknowledgedPresent: false,
        effectivePresent: true,
        lastLocalSequence: 1,
        createdAt: savedAt,
        updatedAt: savedAt,
      });
      legacy.create('FavoriteMutation', {
        mutationUuid: '019a0000-0000-7000-8000-000000000004',
        scopeId,
        favoriteUuid: '019a0000-0000-7000-8000-000000000003',
        catalogType: 'artist',
        catalogUuid: targetUuid,
        desiredPresent: true,
        localSequence: 1,
        state: FavoriteMutationState.Pending,
        attemptCount: 0,
        createdAt: savedAt,
        updatedAt: savedAt,
      });
      legacy.create('FavoriteMutation', {
        mutationUuid: '019a0000-0000-7000-8000-000000000005',
        scopeId,
        favoriteUuid: '019a0000-0000-7000-8000-000000000003',
        catalogType: 'artist',
        catalogUuid: targetUuid,
        desiredPresent: false,
        localSequence: 2,
        state: FavoriteMutationState.Pending,
        attemptCount: 0,
        createdAt: savedAt,
        updatedAt: savedAt,
      });
    });
    legacy.close();

    const migrated = await file.openMigrated();
    expect(migrated.objects(UserFavorite)).toHaveLength(2);
    expect(migrated.objects(FavoriteMutation)).toHaveLength(2);
    expect(migrated.objects(UserFavorite).filtered('scopeId == "anonymous"')[0]).toMatchObject({
      favoriteId: favoriteUuid,
      targetKind: 'source_track',
      targetId: targetUuid,
    });

    await upgradeTypedAccountIdentity(migrated, () => Promise.resolve());

    expect(migrated.objects(AccountProfile)).toHaveLength(0);
    expect(migrated.objects(UserFavorite)[0]).toMatchObject({
      favoriteId: formatUuidTypedId('favorite', favoriteUuid),
      scopeId: 'anonymous',
      targetKind: 'track',
      targetId: formatUuidTypedId('track', targetUuid),
    });
  });

  it('converts pre-favorites flags before assigning typed anonymous identities', async () => {
    const legacy = await file.openPreFavorites();
    legacy.write(() => {
      legacy.create('SourceTrack', { uuid: targetUuid, isFavorite: true });
    });
    legacy.close();

    const migrated = await file.openMigratedPreFavorites();
    expect(migrated.objects(UserFavorite)[0]).toMatchObject({
      scopeId: 'anonymous',
      targetKind: 'track',
      targetId: targetUuid,
    });

    await upgradeTypedAccountIdentity(migrated, () => Promise.resolve());

    expect(migrated.objects(UserFavorite)[0]).toMatchObject({
      scopeId: 'anonymous',
      targetKind: 'track',
      targetId: formatUuidTypedId('track', targetUuid),
    });
  });

  it('discards malformed import receipts without aborting the upgrade', async () => {
    const realm = await file.open();
    realm.write(() => {
      realm.create(AnonymousFavoriteImport, {
        importUuid: 'invalid-destination',
        installationUuid: 'installation',
        destinationScopeId: 'user:not-a-uuid',
        sourceFingerprint: JSON.stringify([`artist:${targetUuid}`]),
        state: AnonymousFavoriteImportState.Deferred,
        sourceFavoriteCount: 1,
        createdAt: savedAt,
        updatedAt: savedAt,
      });
      realm.create(AnonymousFavoriteImport, {
        importUuid: 'invalid-fingerprint',
        installationUuid: 'installation',
        destinationScopeId: `user:${userUuid}`,
        sourceFingerprint: JSON.stringify(['artist:not-a-uuid']),
        state: AnonymousFavoriteImportState.Completed,
        sourceFavoriteCount: 1,
        createdAt: savedAt,
        updatedAt: savedAt,
        completedAt: savedAt,
      });
    });

    await upgradeTypedAccountIdentity(realm, () => Promise.resolve());

    expect(realm.objects(AnonymousFavoriteImport)).toHaveLength(0);
    expect(realm.objects(AccountIdentityUpgradeState)).toHaveLength(1);
  });

  it('preserves anonymous, catalog, offline, queue, history, and completed import state', async () => {
    const realm = await file.open();
    seedAccountState(realm);
    seedPreservedState(realm);
    const offlineFile = join(file.directory, `${targetUuid}.mp3`);
    writeFileSync(offlineFile, 'audio');

    await upgradeTypedAccountIdentity(realm, () => Promise.resolve());

    expect(realm.objects(UserFavorite)).toHaveLength(1);
    expect(realm.objects(UserFavorite)[0]).toMatchObject({
      favoriteId: formatUuidTypedId('favorite', favoriteUuid),
      scopeId: 'anonymous',
      targetKind: 'imported_venue',
      targetId: formatUuidTypedId('imported_venue', targetUuid),
      effectivePresent: true,
    });
    expect(realm.objectForPrimaryKey('SourceTrack', targetUuid)).not.toBeNull();
    expect(realm.objectForPrimaryKey(SourceTrackOfflineInfo, targetUuid)).toMatchObject({
      downloadedBytes: 123,
    });
    expect(realm.objectForPrimaryKey(PlaybackHistoryEntry, 'history-entry')).not.toBeNull();
    expect(PlayerState.defaultObject(realm)?.toJSON()).toMatchObject({
      queueEntries: [{ id: 'queue-entry', sourceTrackUuid: targetUuid }],
      shuffleOrder: { entryIds: ['queue-entry'] },
      checkpoint: { entryId: 'queue-entry', elapsedSeconds: 42, durationSeconds: 300 },
    });
    expect(existsSync(offlineFile)).toBe(true);

    const typedScopeId = formatUuidTypedId('user', userUuid);
    const typedSourceFingerprint = anonymousFavoriteSourceFingerprint([
      {
        targetKind: 'imported_venue',
        targetId: formatUuidTypedId('imported_venue', targetUuid),
      },
    ]);
    expect(realm.objectForPrimaryKey(AnonymousFavoriteImport, 'import-pending')).toMatchObject({
      destinationScopeId: typedScopeId,
      sourceFingerprint: typedSourceFingerprint,
      state: AnonymousFavoriteImportState.Deferred,
    });
    expect(realm.objectForPrimaryKey(AnonymousFavoriteImport, 'import-complete')).toMatchObject({
      destinationScopeId: formatUuidTypedId('user', secondUserUuid),
      sourceFingerprint: typedSourceFingerprint,
      state: AnonymousFavoriteImportState.Completed,
      completedAt: savedAt,
    });
    expect(
      anonymousFavoriteSourceFingerprint(
        realm.objects(UserFavorite).filtered('scopeId == "anonymous"')
      )
    ).toBe(typedSourceFingerprint);
  });

  it('shares one cleanup and never runs a delayed deletion after sign-in is enabled', async () => {
    const realm = await file.open();
    let finishCleanup!: () => void;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        })
    );

    const first = upgradeTypedAccountIdentity(realm, cleanup);
    const second = upgradeTypedAccountIdentity(realm, cleanup);
    expect(cleanup).toHaveBeenCalledOnce();

    finishCleanup();
    await Promise.all([first, second]);

    let newCredentialPresent = true;
    await upgradeTypedAccountIdentity(realm, async () => {
      newCredentialPresent = false;
    });

    expect(newCredentialPresent).toBe(true);
  });
});
