/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAVORITE_REALM_MODELS, FavoriteSyncState } from '@/relisten/realm/models/library';
import { Playlist, PLAYLIST_REALM_MODELS } from '@/relisten/realm/models/playlists/playlist';
import { startRestoreRecovery } from './playlist_sync_state';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const owner = 'user_01890a5dac96774bbcceb302099a8051';
const playlistId = 'playlist_01890a5dac96774bbcceb302099a8052';

describe('restore recovery', () => {
  let directory: string;
  let realm: Realm;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-playlist-sync-'));
    realm = await Realm.open({
      path: join(directory, 'playlists.realm'),
      schemaVersion: 1,
      schema: [...PLAYLIST_REALM_MODELS, ...FAVORITE_REALM_MODELS],
    });
  });

  afterEach(() => {
    realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('settles after a restore to an earlier revision instead of pulling forever', () => {
    const now = new Date();
    realm.write(() => {
      realm.create(Playlist, {
        playlistId,
        name: 'Road Trip',
        createdAt: now,
        updatedAt: now,
        ownerUserId: owner,
        libraryUserId: owner,
        serverState: 'synced',
        appliedRevision: 43,
        summaryRevision: 43,
        historyGeneration: 'generation-a',
      });
      realm.create(FavoriteSyncState, {
        syncStateUuid: 'sync-state',
        scopeId: owner,
        libraryCursor: 'old-history',
        createdAt: now,
        updatedAt: now,
      });
      startRestoreRecovery(realm, owner);
    });

    const playlist = realm.objectForPrimaryKey(Playlist, playlistId)!;
    expect(playlist.appliedRevision).toBeNull();
    expect(playlist.summaryRevision).toBeNull();
    expect(playlist.historyGeneration).toBeNull();
    // The library feed starts over from a snapshot too.
    expect(realm.objects(FavoriteSyncState)[0].libraryCursor).toBeNull();
  });
});
