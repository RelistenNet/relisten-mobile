import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UserPlaylist,
  UserPlaylistAccessRole,
  UserPlaylistEntry,
  UserPlaylistVisibility,
} from '@/relisten/realm/models/user_library/playlists';
import { UserSyncCursor } from '@/relisten/realm/models/user_library/sync';
import { RelistenUserLibraryApiClient } from '@/relisten/api/user_library_client';
import {
  pullUserLibrarySync,
  UserLibraryPlaylistSyncApplier,
  UserLibraryPlaylistSyncError,
  UserLibrarySyncResponse,
} from '@/relisten/user_library/playlist_sync';
import { scopedUserDataPrimaryKey } from '@/relisten/user_library/user_data_scope';
import { migrateUserLibraryRealm } from '@/relisten/realm/models/user_library/migrations';

const schema = [UserPlaylist, UserPlaylistEntry, UserSyncCursor];

function objectWithoutKeys<T extends Record<string, unknown>>(object: T, keys: string[]) {
  const copy = { ...object };

  for (const key of keys) {
    delete copy[key];
  }

  return copy;
}

function syncResponse(overrides: Partial<UserLibrarySyncResponse> = {}): UserLibrarySyncResponse {
  return {
    changes: [
      {
        resource_type: 'playlist',
        updated_at: '2026-06-20T04:31:00.000Z',
        playlist_viewer_state: {
          is_owner: true,
          is_following: false,
          is_collaborator: false,
          can_edit: true,
          access_role: UserPlaylistAccessRole.Owner,
        },
        playlist: {
          playlist_uuid: 'playlist-1',
          short_id: 'abc123',
          owner_user_uuid: 'user-1',
          name: 'Morning run',
          description: 'A synced playlist',
          visibility: UserPlaylistVisibility.Private,
          current_revision: 7,
          entries: [
            {
              playlist_entry_uuid: 'entry-1',
              source_track_uuid: 'track-1',
              block_uuid: null,
              block_position: null,
              position: 'a0',
              added_by_user_uuid: 'user-1',
            },
            {
              playlist_entry_uuid: 'entry-2',
              source_track_uuid: 'track-2',
              block_uuid: 'block-1',
              block_position: 0,
              position: 'b0',
              added_by_user_uuid: 'user-1',
            },
          ],
        },
      },
    ],
    tombstones: [],
    next_cursor: '12',
    ...overrides,
  };
}

describe('pullUserLibrarySync', () => {
  it('uses the user-library sync endpoint and encodes cursors', async () => {
    const response = syncResponse();
    const getJson = vi.fn(async () => response);
    const client = { getJson } as unknown as RelistenUserLibraryApiClient;

    await expect(pullUserLibrarySync(client, 'cursor 1')).resolves.toBe(response);

    expect(getJson).toHaveBeenCalledWith('/sync?cursor=cursor%201');
  });
});

describe('UserLibraryPlaylistSyncApplier', () => {
  let realm: Realm;
  let applier: UserLibraryPlaylistSyncApplier;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-playlist-sync-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema,
      schemaVersion: 1,
    });
    applier = new UserLibraryPlaylistSyncApplier(realm);
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('upserts playlist snapshots, entries, viewer state, and sync cursor by scope', () => {
    applier.applyPullResponse('user:user-1', syncResponse());

    const playlist = realm.objectForPrimaryKey(
      UserPlaylist,
      scopedUserDataPrimaryKey('user:user-1', 'playlist-1')
    );
    const entries = realm
      .objects(UserPlaylistEntry)
      .filtered('scopeId == $0 AND playlistUuid == $1', 'user:user-1', 'playlist-1');

    expect(playlist).toEqual(
      expect.objectContaining({
        uuid: 'playlist-1',
        shortId: 'abc123',
        name: 'Morning run',
        description: 'A synced playlist',
        visibility: UserPlaylistVisibility.Private,
        ownerUserUuid: 'user-1',
        accessRole: UserPlaylistAccessRole.Owner,
        isOwner: true,
        isFollowing: false,
        isCollaborator: false,
        canEdit: true,
        currentRevision: 7,
        updatedAt: new Date('2026-06-20T04:31:00.000Z'),
      })
    );
    expect([...entries].map((entry) => entry.uuid)).toEqual(['entry-1', 'entry-2']);
    expect(entries[1]).toEqual(
      expect.objectContaining({
        sourceTrackUuid: 'track-2',
        addedByUserUuid: 'user-1',
        blockUuid: 'block-1',
        blockPosition: 0,
        position: 'b0',
      })
    );
    expect(applier.getCursor('user:user-1')).toEqual(expect.objectContaining({ cursor: '12' }));
  });

  it('replaces playlist entries from the latest full server snapshot', () => {
    applier.applyPullResponse('user:user-1', syncResponse());

    applier.applyPullResponse(
      'user:user-1',
      syncResponse({
        next_cursor: '13',
        changes: [
          {
            ...syncResponse().changes[0],
            updated_at: '2026-06-20T04:32:00.000Z',
            playlist: {
              ...syncResponse().changes[0].playlist!,
              current_revision: 8,
              entries: [
                {
                  playlist_entry_uuid: 'entry-2',
                  source_track_uuid: 'track-2',
                  block_uuid: null,
                  block_position: null,
                  position: 'a0',
                  added_by_user_uuid: 'user-1',
                },
              ],
            },
          },
        ],
      })
    );

    const removedEntry = realm.objectForPrimaryKey(
      UserPlaylistEntry,
      scopedUserDataPrimaryKey('user:user-1', 'entry-1')
    );
    const retainedEntry = realm.objectForPrimaryKey(
      UserPlaylistEntry,
      scopedUserDataPrimaryKey('user:user-1', 'entry-2')
    );

    expect(removedEntry?.deletedAt).toEqual(new Date('2026-06-20T04:32:00.000Z'));
    expect(retainedEntry).toEqual(
      expect.objectContaining({
        position: 'a0',
        blockUuid: null,
        blockPosition: null,
        deletedAt: null,
      })
    );
    expect(applier.getCursor('user:user-1')?.cursor).toBe('13');
  });

  it('keeps identical playlist uuids isolated by scope', () => {
    applier.applyPullResponse('user:user-1', syncResponse());
    applier.applyPullResponse(
      'user:user-2',
      syncResponse({
        changes: [
          {
            ...syncResponse().changes[0],
            playlist: {
              ...syncResponse().changes[0].playlist!,
              name: 'Other user playlist',
            },
          },
        ],
      })
    );

    expect(
      realm.objectForPrimaryKey(UserPlaylist, scopedUserDataPrimaryKey('user:user-1', 'playlist-1'))
    ).toEqual(expect.objectContaining({ name: 'Morning run' }));
    expect(
      realm.objectForPrimaryKey(UserPlaylist, scopedUserDataPrimaryKey('user:user-2', 'playlist-1'))
    ).toEqual(expect.objectContaining({ name: 'Other user playlist' }));
  });

  it('marks playlist access tombstones deleted without removing scoped rows', () => {
    applier.applyPullResponse('user:user-1', syncResponse());

    applier.applyPullResponse('user:user-1', {
      changes: [],
      tombstones: [
        {
          resource_type: 'playlist_access',
          playlist_uuid: 'playlist-1',
          deleted_at: '2026-06-20T04:40:00.000Z',
        },
      ],
      next_cursor: '14',
    });

    const playlist = realm.objectForPrimaryKey(
      UserPlaylist,
      scopedUserDataPrimaryKey('user:user-1', 'playlist-1')
    );
    const entry = realm.objectForPrimaryKey(
      UserPlaylistEntry,
      scopedUserDataPrimaryKey('user:user-1', 'entry-1')
    );

    expect(playlist?.deletedAt).toEqual(new Date('2026-06-20T04:40:00.000Z'));
    expect(entry?.deletedAt).toEqual(new Date('2026-06-20T04:40:00.000Z'));
    expect(applier.getCursor('user:user-1')?.cursor).toBe('14');
  });

  it('marks direct playlist tombstones deleted', () => {
    applier.applyPullResponse('user:user-1', syncResponse());

    applier.applyPullResponse('user:user-1', {
      changes: [],
      tombstones: [
        {
          resource_type: 'playlist',
          playlist_uuid: 'playlist-1',
          deleted_at: '2026-06-20T04:40:00.000Z',
        },
      ],
      next_cursor: '14',
    });

    expect(
      realm.objectForPrimaryKey(UserPlaylist, scopedUserDataPrimaryKey('user:user-1', 'playlist-1'))
        ?.deletedAt
    ).toEqual(new Date('2026-06-20T04:40:00.000Z'));
    expect(applier.getCursor('user:user-1')?.cursor).toBe('14');
  });

  it('rejects unsupported resources before advancing the global sync cursor', () => {
    expect(() =>
      applier.applyPullResponse('user:user-1', {
        changes: [
          {
            resource_type: 'favorite',
            updated_at: '2026-06-20T04:31:00.000Z',
          },
        ],
        tombstones: [],
        next_cursor: '99',
      })
    ).toThrowError(new UserLibraryPlaylistSyncError('unsupported_sync_change'));

    expect(applier.getCursor('user:user-1')).toBeNull();
    expect(realm.objects(UserPlaylist).length).toBe(0);
  });

  it('preflights mixed unsupported resources before mutating rows or advancing cursors', () => {
    applier.applyPullResponse('user:user-1', syncResponse());
    const playlist = realm.objectForPrimaryKey(
      UserPlaylist,
      scopedUserDataPrimaryKey('user:user-1', 'playlist-1')
    );

    expect(() =>
      applier.applyPullResponse(
        'user:user-1',
        syncResponse({
          changes: [
            {
              ...syncResponse().changes[0],
              playlist: {
                ...syncResponse().changes[0].playlist!,
                name: 'Should not persist',
              },
            },
            {
              resource_type: 'favorite',
              updated_at: '2026-06-20T04:31:00.000Z',
            },
          ],
          next_cursor: '99',
        })
      )
    ).toThrowError(new UserLibraryPlaylistSyncError('unsupported_sync_change'));

    expect(playlist?.name).toBe('Morning run');
    expect(applier.getCursor('user:user-1')?.cursor).toBe('12');
  });

  it('opens version 15 playlist rows with version 16 optional sync metadata fields', () => {
    const migrationDir = mkdtempSync(join(tmpdir(), 'relisten-playlist-sync-migration-'));
    const realmPath = join(migrationDir, 'test.realm');
    const playlistV15Properties = objectWithoutKeys(UserPlaylist.schema.properties, [
      'shortId',
      'accessRole',
      'isOwner',
      'isFollowing',
      'isCollaborator',
      'canEdit',
    ]);
    const entryV15Properties = objectWithoutKeys(UserPlaylistEntry.schema.properties, [
      'addedByUserUuid',
    ]);
    const playlistV15Schema: Realm.ObjectSchema = {
      ...UserPlaylist.schema,
      properties: playlistV15Properties,
    };
    const entryV15Schema: Realm.ObjectSchema = {
      ...UserPlaylistEntry.schema,
      properties: entryV15Properties,
    };

    const oldRealm = new Realm({
      path: realmPath,
      schema: [playlistV15Schema, entryV15Schema],
      schemaVersion: 15,
    });

    try {
      oldRealm.write(() => {
        oldRealm.create(UserPlaylist.schema.name, {
          scopedId: scopedUserDataPrimaryKey('user:user-1', 'playlist-1'),
          scopeId: 'user:user-1',
          uuid: 'playlist-1',
          name: 'Existing playlist',
          visibility: UserPlaylistVisibility.Private,
          currentRevision: 1,
          createdAt: new Date('2026-06-20T04:00:00.000Z'),
          updatedAt: new Date('2026-06-20T04:00:00.000Z'),
        });
        oldRealm.create(UserPlaylistEntry.schema.name, {
          scopedId: scopedUserDataPrimaryKey('user:user-1', 'entry-1'),
          scopeId: 'user:user-1',
          uuid: 'entry-1',
          playlistUuid: 'playlist-1',
          sourceTrackUuid: 'track-1',
          position: 'a0',
          createdAt: new Date('2026-06-20T04:00:00.000Z'),
          updatedAt: new Date('2026-06-20T04:00:00.000Z'),
        });
      });
    } finally {
      oldRealm.close();
    }

    const migratedRealm = new Realm({
      path: realmPath,
      schema,
      schemaVersion: 16,
      onMigration: migrateUserLibraryRealm,
    });

    try {
      const playlist = migratedRealm.objectForPrimaryKey(
        UserPlaylist,
        scopedUserDataPrimaryKey('user:user-1', 'playlist-1')
      );
      const entry = migratedRealm.objectForPrimaryKey(
        UserPlaylistEntry,
        scopedUserDataPrimaryKey('user:user-1', 'entry-1')
      );

      expect(playlist?.shortId).toBeNull();
      expect(playlist?.accessRole).toBeNull();
      expect(playlist?.isOwner).toBeNull();
      expect(entry?.addedByUserUuid).toBeNull();
    } finally {
      migratedRealm.close();
      rmSync(migrationDir, { recursive: true, force: true });
    }
  });
});
