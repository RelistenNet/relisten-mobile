/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAVORITE_REALM_MODELS } from '@/relisten/realm/models/library';
import {
  Playlist,
  PlaylistEntry,
  PLAYLIST_REALM_MODELS,
  PlaylistSegment,
} from '@/relisten/realm/models/playlists/playlist';
import {
  canAccessPlaylist,
  canEditPlaylist,
  claimUnownedPlaylists,
  startRestoreRecovery,
} from '@/relisten/playlists/sync/playlist_sync_state';
import {
  applyFollowChanges,
  applyFollowedHeads,
  followNeedsSnapshot,
  followsNeedingSnapshot,
  replaceFollows,
  writeFollowedSnapshot,
} from './followed_playlists';
import type { FollowedPlaylistHead, PublicPlaylistSnapshot } from './sharing_wire';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const follower = 'user_01890a5dac96774bbcceb302099a8051';
const owner = 'user_01890a5dac96774bbcceb302099a8061';
const otherAccount = 'user_01890a5dac96774bbcceb302099a8071';
const playlistId = 'playlist_01890a5dac96774bbcceb302099a8052';
const publicCode = '0123456789abcdef0123456789abcdef';

const head = (revision: number, name = 'Cornell + friends'): FollowedPlaylistHead => ({
  playlist_id: playlistId,
  available: true,
  public_code: publicCode,
  name,
  owner: { id: owner, username: 'deadhead' },
  revision,
});

const snapshot = (
  revision: number,
  entries: [string, string | null][]
): PublicPlaylistSnapshot => ({
  contract_version: 1,
  history_generation: 'generation-a',
  playlist_id: playlistId,
  public_code: publicCode,
  revision,
  owner: { id: owner, username: 'deadhead' },
  metadata: { name: 'Cornell + friends', description: null },
  segments: [
    {
      segment_id: 'playlist_segment_01890a5dac96774bbcceb302099a8053',
      rank: 'a0',
      description: 'Start here ![x](https://tracker.example/p.gif)',
      entries: entries.map(([entryId, trackId], index) => ({
        entry_id: entryId,
        track_id: trackId,
        rank: `a${index}`,
      })),
    },
  ],
});

const trackEntry = 'playlist_entry_01890a5dac96774bbcceb302099a8054';
const textEntry = 'playlist_entry_01890a5dac96774bbcceb302099a8055';
const laterEntry = 'playlist_entry_01890a5dac96774bbcceb302099a8056';
const trackId = 'track_01890a5dac96774bbcceb302099a8057';

describe('followed playlists', () => {
  let directory: string;
  let realm: Realm;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-follows-'));
    realm = await Realm.open({
      path: join(directory, 'follows.realm'),
      schemaVersion: 1,
      schema: [...PLAYLIST_REALM_MODELS, ...FAVORITE_REALM_MODELS],
    });
    realm.write(() => claimUnownedPlaylists(realm, follower));
  });

  afterEach(() => {
    realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const stored = () => realm.objectForPrimaryKey(Playlist, playlistId);
  const follow = () =>
    realm.write(() => {
      applyFollowChanges(realm, follower, [{ playlistId, followed: true }]);
      applyFollowedHeads(realm, follower, [head(3)]);
    });

  it('shows a followed playlist read-only, named by its head, and pulls it', () => {
    follow();

    const playlist = stored()!;
    expect(playlist.name).toBe('Cornell + friends');
    expect(playlist.ownerUserId).toBe(owner);
    expect(playlist.ownerUsername).toBe('deadhead');
    expect(canAccessPlaylist(realm, playlist)).toBe(true);
    expect(canEditPlaylist(realm, playlist)).toBe(false);
    expect(followsNeedingSnapshot(realm, follower, 20)).toEqual([playlist]);
  });

  it('replaces the rows from the public snapshot, sanitizing guide text', () => {
    follow();
    realm.write(() =>
      writeFollowedSnapshot(
        realm,
        stored()!,
        snapshot(3, [
          [trackEntry, trackId],
          [textEntry, null],
        ])
      )
    );
    realm.write(() =>
      writeFollowedSnapshot(realm, stored()!, snapshot(4, [[laterEntry, trackId]]))
    );

    const entries = realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId);
    expect(entries.map((entry) => entry.entryId)).toEqual([laterEntry]);
    expect(stored()!.entryCount).toBe(1);
    const segment = realm.objects(PlaylistSegment).filtered('playlistId == $0', playlistId)[0];
    expect(segment.descriptionMarkdown).not.toContain('tracker.example');
    expect(followNeedsSnapshot(stored()!)).toBe(false);

    realm.write(() => applyFollowedHeads(realm, follower, [head(5)]));
    expect(followNeedsSnapshot(stored()!)).toBe(true);
  });

  it('keeps the last name of a playlist that became unavailable', () => {
    follow();
    realm.write(() =>
      applyFollowedHeads(realm, follower, [{ playlist_id: playlistId, available: false }])
    );

    expect(stored()!.name).toBe('Cornell + friends');
    expect(stored()!.unavailable).toBe(true);
    expect(followNeedsSnapshot(stored()!)).toBe(false);
  });

  it('removes an unfollowed playlist with its rows', () => {
    follow();
    realm.write(() =>
      writeFollowedSnapshot(realm, stored()!, snapshot(3, [[trackEntry, trackId]]))
    );

    realm.write(() => applyFollowChanges(realm, follower, [{ playlistId, followed: false }]));

    expect(stored()).toBeNull();
    expect(realm.objects(PlaylistEntry).filtered('playlistId == $0', playlistId)).toHaveLength(0);
  });

  it('treats a library snapshot as the whole follow list', () => {
    follow();

    realm.write(() => replaceFollows(realm, follower, []));

    expect(stored()).toBeNull();
  });

  it('keeps the playlist the listener made when they follow it', () => {
    realm.write(() => {
      realm.create(Playlist, {
        playlistId,
        name: 'Mine',
        createdAt: new Date(),
        updatedAt: new Date(),
        ownerUserId: follower,
        libraryUserId: follower,
        serverState: 'synced',
      });
    });

    follow();
    realm.write(() => applyFollowChanges(realm, follower, [{ playlistId, followed: false }]));
    realm.write(() => replaceFollows(realm, follower, []));

    expect(stored()!.name).toBe('Mine');
    expect(stored()!.access).toBe('owner');
  });

  it("leaves another account's playlist with the same ID alone", () => {
    realm.write(() => {
      realm.create(Playlist, {
        playlistId,
        name: 'Theirs',
        createdAt: new Date(),
        updatedAt: new Date(),
        ownerUserId: otherAccount,
        libraryUserId: otherAccount,
        serverState: 'synced',
      });
    });

    follow();
    realm.write(() => replaceFollows(realm, follower, []));

    expect(stored()!.libraryUserId).toBe(otherAccount);
    expect(stored()!.name).toBe('Theirs');
  });

  it('pulls every followed playlist again after a restore', () => {
    follow();
    realm.write(() =>
      writeFollowedSnapshot(realm, stored()!, snapshot(3, [[trackEntry, trackId]]))
    );

    realm.write(() => startRestoreRecovery(realm, follower));

    expect(followNeedsSnapshot(stored()!)).toBe(true);
  });
});
