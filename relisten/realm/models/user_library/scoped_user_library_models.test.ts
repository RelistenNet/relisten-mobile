import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { describe, expect, it } from 'vitest';
import {
  ActiveUserDataScope,
  PendingUserOperation,
  ScopedPlaybackHistoryEntry,
  ScopedUserSettings,
  USER_LIBRARY_REALM_MODELS,
  UserAuthSessionMetadata,
  UserDataMigrationMarker,
  UserFavorite,
  migrateUserLibraryRealm,
  UserMobileAccessGrant,
  UserPlaylist,
  UserPlaylistEntry,
  UserSyncCursor,
} from '@/relisten/realm/models/user_library';

const scopedModels = [
  UserAuthSessionMetadata,
  UserPlaylist,
  UserPlaylistEntry,
  UserMobileAccessGrant,
  UserFavorite,
  ScopedUserSettings,
  PendingUserOperation,
  UserSyncCursor,
  UserDataMigrationMarker,
  ScopedPlaybackHistoryEntry,
];

describe('scoped user library Realm models', () => {
  it('exports the complete schema bundle consumed by the main Realm config', () => {
    expect(USER_LIBRARY_REALM_MODELS.map((model) => model.schema.name)).toEqual([
      ActiveUserDataScope.schema.name,
      ...scopedModels.map((model) => model.schema.name),
    ]);
  });

  it('opens a Realm with the complete user-library model bundle', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'relisten-user-library-schema-'));
    const realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema: [...USER_LIBRARY_REALM_MODELS],
      schemaVersion: 1,
    });

    try {
      expect(new Set(realm.schema.map((objectSchema) => objectSchema.name))).toEqual(
        new Set([
          ActiveUserDataScope.schema.name,
          ...scopedModels.map((model) => model.schema.name),
        ])
      );
    } finally {
      realm.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps every user-owned row scoped by scopeId with scopedId primary keys', () => {
    for (const model of scopedModels) {
      expect(model.schema.primaryKey).toBe('scopedId');
      expect(model.schema.properties).toHaveProperty('scopeId');
    }
  });

  it('stores playlist entry positions as fractional strings', () => {
    expect(UserPlaylistEntry.schema.properties.position).toBe('string');
  });

  it('stores optional playback history block attribution fields', () => {
    expect(ScopedPlaybackHistoryEntry.schema.properties.blockUuid).toEqual({
      type: 'string',
      indexed: true,
      optional: true,
    });
    expect(ScopedPlaybackHistoryEntry.schema.properties.blockPosition).toBe('int?');
  });

  it('migrates legacy numeric playlist entry positions to strings', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'relisten-user-library-migration-'));
    const realmPath = join(tempDir, 'test.realm');
    const legacyPlaylistEntrySchema: Realm.ObjectSchema = {
      ...UserPlaylistEntry.schema,
      properties: {
        ...UserPlaylistEntry.schema.properties,
        position: 'int',
      },
    };
    const legacyRealm = new Realm({
      path: realmPath,
      schema: [legacyPlaylistEntrySchema],
      schemaVersion: 14,
    });

    try {
      legacyRealm.write(() => {
        legacyRealm.create(UserPlaylistEntry.schema.name, {
          scopedId: 'scope-1:entry-1',
          scopeId: 'scope-1',
          uuid: 'entry-1',
          playlistUuid: 'playlist-1',
          sourceTrackUuid: 'source-track-1',
          blockPosition: null,
          position: 42,
          createdAt: new Date('2026-06-20T00:00:00.000Z'),
          updatedAt: new Date('2026-06-20T00:00:00.000Z'),
        });
      });
    } finally {
      legacyRealm.close();
    }

    const migratedRealm = new Realm({
      path: realmPath,
      schema: [UserPlaylistEntry],
      schemaVersion: 15,
      onMigration: migrateUserLibraryRealm,
    });

    try {
      const migratedEntry = migratedRealm.objectForPrimaryKey(
        UserPlaylistEntry.schema.name,
        'scope-1:entry-1'
      ) as UserPlaylistEntry | null;

      expect(migratedEntry?.position).toBe('42');
    } finally {
      migratedRealm.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does not query user-library models when migrating older catalog-only Realms', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'relisten-catalog-only-migration-'));
    const realmPath = join(tempDir, 'test.realm');
    const legacyCatalogSchema: Realm.ObjectSchema = {
      name: 'LegacyCatalogOnly',
      primaryKey: 'uuid',
      properties: {
        uuid: 'string',
      },
    };
    const legacyRealm = new Realm({
      path: realmPath,
      schema: [legacyCatalogSchema],
      schemaVersion: 12,
    });

    legacyRealm.close();

    const migratedRealm = new Realm({
      path: realmPath,
      schema: [legacyCatalogSchema, UserPlaylistEntry],
      schemaVersion: 15,
      onMigration: migrateUserLibraryRealm,
    });

    try {
      expect(migratedRealm.schema.map((schema) => schema.name)).toEqual([
        legacyCatalogSchema.name,
        UserPlaylistEntry.schema.name,
      ]);
    } finally {
      migratedRealm.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps auth and grant models free of token material', () => {
    expect(Object.keys(UserAuthSessionMetadata.schema.properties)).not.toEqual(
      expect.arrayContaining(['accessToken', 'refreshToken'])
    );
    expect(Object.keys(UserMobileAccessGrant.schema.properties)).not.toEqual(
      expect.arrayContaining(['token', 'secret'])
    );
  });
});
