/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ACCOUNT_REALM_MODELS,
  AccountProfile,
  PendingUsernameCommand,
} from '@/relisten/realm/models/accounts';
import {
  FAVORITE_REALM_MODELS,
  FavoriteMutation,
  FavoriteMutationState,
  FavoriteSyncState,
  UserFavorite,
} from '@/relisten/realm/models/library';
import {
  Playlist,
  PlaylistCommand,
  PLAYLIST_DEVICE_STATE_ID,
  PLAYLIST_REALM_MODELS,
  PlaylistDeviceState,
  PlaylistEntry,
  PlaylistOperation,
  PlaylistSegment,
} from '@/relisten/realm/models/playlists/playlist';
import { forgetDeletedAccount, hideUnconfirmedAccount } from './account_local_data';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const deleted = 'user_01890a5dac96774bbcceb302099a8051';
const survivor = 'user_01890a5dac96774bbcceb302099a8061';

describe('account local data', () => {
  let directory: string;
  let realm: Realm;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-account-data-'));
    realm = await Realm.open({
      path: join(directory, 'accounts.realm'),
      schemaVersion: 1,
      schema: [...ACCOUNT_REALM_MODELS, ...FAVORITE_REALM_MODELS, ...PLAYLIST_REALM_MODELS],
    });
    realm.write(() => {
      for (const userId of [deleted, survivor]) {
        seedAccount(realm, userId);
      }
      seedDevicePlaylist(realm);
      realm.create(PlaylistDeviceState, {
        id: PLAYLIST_DEVICE_STATE_ID,
        lastSignedInUserId: deleted,
      });
    });
  });

  afterEach(() => {
    realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("removes a deleted account's rows and keeps everyone else's", () => {
    forgetDeletedAccount(realm, deleted);

    for (const [type, field] of accountTables) {
      expect(realm.objects(type.schema.name).filtered(`${field} == $0`, deleted)).toHaveLength(0);
      expect(realm.objects(type.schema.name).filtered(`${field} == $0`, survivor)).toHaveLength(1);
    }
    expect(realm.objects(PlaylistSegment).map((row) => row.playlistId)).toEqual([
      `playlist_${survivor}`,
      'playlist_device',
    ]);
    expect(realm.objects(PlaylistEntry).map((row) => row.playlistId)).toEqual([
      `playlist_${survivor}`,
      'playlist_device',
    ]);
    expect(realm.objectForPrimaryKey(Playlist, 'playlist_device')).not.toBeNull();
    expect(lastSignedInUserId(realm)).toBeNull();
  });

  // Account data lives in these three model groups. The app's full schema
  // can't load under Vitest, since other models import React Native.
  it('covers every account, favorite and playlist table with an account field', () => {
    const accountFields = new Set(['scopeId', 'userId', 'ownerUserId', 'destinationScopeId']);
    const withAccountField = [
      ...ACCOUNT_REALM_MODELS,
      ...FAVORITE_REALM_MODELS,
      ...PLAYLIST_REALM_MODELS,
    ]
      .map((model) => model.schema)
      .filter((schema) => Object.keys(schema.properties).some((name) => accountFields.has(name)))
      .map((schema) => schema.name);
    const covered = [
      ...accountTables.map(([type]) => type.schema.name),
      // Removed in forgetDeletedAccount by destinationScopeId; not seeded here.
      'AnonymousFavoriteImport',
      // The device's current scope, not an account's data.
      'ActiveAccountScope',
    ];

    // A new table here must be removed in forgetDeletedAccount and added to accountTables.
    expect(withAccountField.sort()).toEqual(covered.sort());
  });

  it('hides an unconfirmed deletion without removing anything', () => {
    hideUnconfirmedAccount(realm, deleted);

    for (const [type, field] of accountTables) {
      expect(realm.objects(type.schema.name).filtered(`${field} == $0`, deleted)).toHaveLength(1);
    }
    expect(lastSignedInUserId(realm)).toBeNull();
  });

  it('leaves another visible account alone', () => {
    realm.write(() => {
      realm.objectForPrimaryKey(PlaylistDeviceState, PLAYLIST_DEVICE_STATE_ID)!.lastSignedInUserId =
        survivor;
    });

    hideUnconfirmedAccount(realm, deleted);

    expect(lastSignedInUserId(realm)).toBe(survivor);
  });
});

const accountTables = [
  [UserFavorite, 'scopeId'],
  [FavoriteMutation, 'scopeId'],
  [FavoriteSyncState, 'scopeId'],
  [AccountProfile, 'scopeId'],
  [PendingUsernameCommand, 'scopeId'],
  [Playlist, 'ownerUserId'],
  [PlaylistOperation, 'ownerUserId'],
  [PlaylistCommand, 'ownerUserId'],
] as const;

function lastSignedInUserId(realm: Realm) {
  return realm.objectForPrimaryKey(PlaylistDeviceState, PLAYLIST_DEVICE_STATE_ID)
    ?.lastSignedInUserId;
}

function seedAccount(realm: Realm, userId: string) {
  const now = new Date();
  const playlistId = `playlist_${userId}`;

  realm.create(UserFavorite, {
    favoriteId: `favorite_${userId}`,
    scopeId: userId,
    targetKind: 'show',
    targetId: 'show_1',
    effectivePresent: true,
    createdAt: now,
    updatedAt: now,
  });
  realm.create(FavoriteMutation, {
    mutationId: `mutation_${userId}`,
    scopeId: userId,
    favoriteId: `favorite_${userId}`,
    targetKind: 'show',
    targetId: 'show_1',
    desiredPresent: true,
    localSequence: 1,
    state: FavoriteMutationState.Pending,
    createdAt: now,
    updatedAt: now,
  });
  realm.create(FavoriteSyncState, {
    syncStateUuid: `sync_${userId}`,
    scopeId: userId,
    createdAt: now,
    updatedAt: now,
  });
  realm.create(AccountProfile, {
    scopeId: userId,
    userId,
    username: userId.slice(-6),
    usernameVersion: 1,
    usernameReviewNeeded: false,
    nativeSessionId: `session_${userId}`,
    lastSyncedAt: now,
  });
  realm.create(PendingUsernameCommand, {
    scopeId: userId,
    commandId: `username_${userId}`,
    expectedUsernameVersion: 1,
    username: 'new_name',
    createdAt: now,
  });

  realm.create(Playlist, {
    playlistId,
    name: 'Road Trip',
    createdAt: now,
    updatedAt: now,
    ownerUserId: userId,
    serverState: 'synced',
  });
  seedRows(realm, playlistId);
  realm.create(PlaylistOperation, {
    operationId: `operation_${userId}`,
    playlistId,
    ownerUserId: userId,
    localSequence: 1,
    operationJson: '{}',
    baseRevision: 1,
    state: 'pending',
    createdAt: now,
  });
  realm.create(PlaylistCommand, {
    commandId: `command_${userId}`,
    playlistId,
    ownerUserId: userId,
    requestJson: '{}',
    state: 'pending',
    createdAt: now,
  });
}

function seedDevicePlaylist(realm: Realm) {
  const now = new Date();
  realm.create(Playlist, {
    playlistId: 'playlist_device',
    name: 'On this phone',
    createdAt: now,
    updatedAt: now,
  });
  seedRows(realm, 'playlist_device');
}

function seedRows(realm: Realm, playlistId: string) {
  realm.create(PlaylistSegment, {
    segmentId: `segment_${playlistId}`,
    playlistId,
    rank: 'a',
    live: true,
  });
  realm.create(PlaylistEntry, {
    entryId: `entry_${playlistId}`,
    playlistId,
    segmentId: `segment_${playlistId}`,
    trackId: 'track_1',
    rank: 'a',
    live: true,
  });
}
