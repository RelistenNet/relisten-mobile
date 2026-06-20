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

  it('keeps auth and grant models free of token material', () => {
    expect(Object.keys(UserAuthSessionMetadata.schema.properties)).not.toEqual(
      expect.arrayContaining(['accessToken', 'refreshToken'])
    );
    expect(Object.keys(UserMobileAccessGrant.schema.properties)).not.toEqual(
      expect.arrayContaining(['token', 'secret'])
    );
  });
});
