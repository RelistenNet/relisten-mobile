/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAVORITE_REALM_MODELS } from '@/relisten/realm/models/library';
import {
  Playlist,
  PlaylistCommand,
  PlaylistOperation,
  PLAYLIST_REALM_MODELS,
} from '@/relisten/realm/models/playlists/playlist';
import {
  canAccessPlaylist,
  canEditPlaylist,
  claimDevicePlaylists,
} from '@/relisten/playlists/sync/playlist_sync_state';
import { migratePlaylistLibraryUsers } from './playlist_library_migration';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const accountA = 'user_01890a5dac96774bbcceb302099a8051';
const accountB = 'user_01890a5dac96774bbcceb302099a8061';
const playlistId = 'playlist_01890a5dac96774bbcceb302099a8052';
const SCHEMA_26_FIELDS = [
  'libraryUserId',
  'access',
  'ownerUsername',
  'publicCode',
  'published',
  'takenDown',
  'unavailable',
];

/** The Playlist model as schema 25 stored it, before the library user was split out. */
const schema25Playlist: Realm.ObjectSchema = {
  ...Playlist.schema,
  properties: Object.fromEntries(
    Object.entries(Playlist.schema.properties).filter(([name]) => !SCHEMA_26_FIELDS.includes(name))
  ),
};

/** An outbox model as schema 25 stored it, naming its account `ownerUserId`. */
const withOwnerUserId = ({
  properties: { libraryUserId, ...rest },
  ...model
}: Realm.ObjectSchema) => ({
  ...model,
  properties: { ...rest, ownerUserId: libraryUserId },
});

describe('playlist library migration', () => {
  let directory: string;
  let path: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-playlist-migration-'));
    path = join(directory, 'playlists.realm');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps A's playlist and pending edit through a switch to B and back", async () => {
    const legacy = await Realm.open({
      path,
      schemaVersion: 25,
      schema: [
        schema25Playlist,
        ...PLAYLIST_REALM_MODELS.filter((model) => model !== Playlist).map((m) =>
          m === PlaylistOperation || m === PlaylistCommand ? withOwnerUserId(m.schema) : m.schema
        ),
        ...FAVORITE_REALM_MODELS,
      ],
    });
    legacy.write(() => {
      const now = new Date();
      legacy.create('Playlist', {
        playlistId,
        name: 'Road Trip',
        createdAt: now,
        updatedAt: now,
        ownerUserId: accountA,
        serverState: 'synced',
        appliedRevision: 4,
      });
      legacy.create('PlaylistOperation', {
        operationId: 'playlist_operation_01890a5dac96774bbcceb302099a8053',
        playlistId,
        ownerUserId: accountA,
        localSequence: 1,
        operationJson: '{"type":"update_metadata","name":"Road Trip II"}',
        baseRevision: 4,
        state: 'pending',
        createdAt: now,
      });
      legacy.create('PlaylistDeviceState', {
        id: 'device',
        lastSignedInUserId: accountA,
      });
    });
    legacy.close();

    const realm = await Realm.open({
      path,
      // At or past every version the migration handles.
      schemaVersion: 28,
      schema: [...PLAYLIST_REALM_MODELS, ...FAVORITE_REALM_MODELS],
      onMigration: migratePlaylistLibraryUsers,
    });
    try {
      const playlist = realm.objectForPrimaryKey(Playlist, playlistId)!;
      expect(playlist.libraryUserId).toBe(accountA);
      expect(playlist.access).toBe('owner');
      expect(canEditPlaylist(realm, playlist)).toBe(true);

      realm.write(() => claimDevicePlaylists(realm, accountB));
      expect(playlist.ownerUserId).toBe(accountA);
      expect(canAccessPlaylist(realm, playlist)).toBe(false);

      realm.write(() => claimDevicePlaylists(realm, accountA));
      expect(canEditPlaylist(realm, playlist)).toBe(true);
      expect(realm.objects(PlaylistOperation).map((op) => [op.libraryUserId, op.state])).toEqual([
        [accountA, 'pending'],
      ]);
    } finally {
      realm.close();
    }
  });
});
