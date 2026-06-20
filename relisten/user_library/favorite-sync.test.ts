import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelistenUserLibraryApiClient } from '@/relisten/api/user_library_client';
import {
  UserDataMigrationMarker,
  UserFavorite,
  UserFavoriteEntityType,
} from '@/relisten/realm/models/user_library';
import {
  applyUserFavoriteChange,
  applyUserFavoriteTombstone,
  deleteUserLibraryFavorite,
  listUserLibraryFavorites,
  migrateCatalogFavoritesToScopedRows,
  normalizeUserFavoriteEntityType,
  putUserLibraryFavorite,
  userFavoriteScopedId,
  UserLibraryFavoriteSyncError,
} from '@/relisten/user_library/favorite_sync';
import {
  catalogFavoriteDescriptorForObject,
  isActiveScopedFavorite,
  setScopedFavoriteState,
  UserLibraryFavoriteMutationService,
} from '@/relisten/user_library/favorite_state';

const catalogFavoriteSchemas: Realm.ObjectSchema[] = [
  favoriteCatalogSchema('Artist'),
  favoriteCatalogSchema('Show'),
  favoriteCatalogSchema('Source'),
  favoriteCatalogSchema('SourceTrack'),
  favoriteCatalogSchema('Tour'),
  favoriteCatalogSchema('Song'),
];
const schema = [UserFavorite, UserDataMigrationMarker, ...catalogFavoriteSchemas];
const SCOPE_ID = 'user:user-1';

function favoriteCatalogSchema(name: string): Realm.ObjectSchema {
  return {
    name,
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      isFavorite: { type: 'bool', default: false },
    },
  };
}

function favoriteResponse(entityType = 'artist') {
  return {
    entity_type: entityType,
    entity_uuid: `${entityType}-1`,
    created_at: '2026-06-20T04:40:00.000Z',
    updated_at: '2026-06-20T04:41:00.000Z',
  };
}

describe('user-library favorite API helpers', () => {
  it('targets the authenticated favorite endpoints with server entity types', async () => {
    const favorite = favoriteResponse('track');
    const getJson = vi.fn(async () => [favorite]);
    const putJson = vi.fn(async () => favorite);
    const deleteJson = vi.fn(async () => undefined);
    const client = {
      getJson,
      putJson,
      deleteJson,
    } as unknown as RelistenUserLibraryApiClient;

    await expect(listUserLibraryFavorites(client)).resolves.toEqual([favorite]);
    await expect(
      putUserLibraryFavorite(client, UserFavoriteEntityType.Track, 'track 1')
    ).resolves.toBe(favorite);
    await expect(
      deleteUserLibraryFavorite(client, UserFavoriteEntityType.Source, 'source 1')
    ).resolves.toBeUndefined();

    expect(getJson).toHaveBeenCalledWith('/favorites');
    expect(putJson).toHaveBeenCalledWith('/favorites/track/track%201', {});
    expect(deleteJson).toHaveBeenCalledWith('/favorites/source/source%201');
  });
});

describe('user-library favorite sync', () => {
  let realm: Realm;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-favorite-sync-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema,
      schemaVersion: 1,
    });
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('normalizes source-track favorites to the server track entity type', () => {
    expect(normalizeUserFavoriteEntityType('source_track')).toBe(UserFavoriteEntityType.Track);
    expect(normalizeUserFavoriteEntityType('track')).toBe(UserFavoriteEntityType.Track);
    expect(() => normalizeUserFavoriteEntityType('venue')).toThrowError(
      new UserLibraryFavoriteSyncError('unsupported_favorite_entity_type')
    );
  });

  it('upserts favorite changes and tombstones by scoped entity key', () => {
    realm.write(() => {
      applyUserFavoriteChange(realm, 'user:user-1', favoriteResponse('track'));
    });

    const favorite = realm.objectForPrimaryKey(
      UserFavorite,
      userFavoriteScopedId('user:user-1', UserFavoriteEntityType.Track, 'track-1')
    );
    expect(favorite).toEqual(
      expect.objectContaining({
        entityType: UserFavoriteEntityType.Track,
        entityUuid: 'track-1',
        createdAt: new Date('2026-06-20T04:40:00.000Z'),
        updatedAt: new Date('2026-06-20T04:41:00.000Z'),
        deletedAt: null,
      })
    );

    realm.write(() => {
      applyUserFavoriteTombstone(realm, 'user:user-1', {
        resource_type: 'favorite',
        entity_type: 'track',
        entity_uuid: 'track-1',
        deleted_at: '2026-06-20T04:42:00.000Z',
      });
    });

    expect(favorite?.deletedAt).toEqual(new Date('2026-06-20T04:42:00.000Z'));
  });

  it('copies existing catalog favorites into scoped rows once without clearing catalog flags', () => {
    realm.write(() => {
      realm.create('Artist', { uuid: 'artist-1', isFavorite: true });
      realm.create('Show', { uuid: 'show-1', isFavorite: true });
      realm.create('Source', { uuid: 'source-1', isFavorite: true });
      realm.create('SourceTrack', { uuid: 'track-1', isFavorite: true });
      realm.create('Tour', { uuid: 'tour-1', isFavorite: true });
      realm.create('Song', { uuid: 'song-1', isFavorite: true });
      realm.create('Artist', { uuid: 'artist-2', isFavorite: false });
    });

    const migratedAt = new Date('2026-06-20T04:45:00.000Z');
    const first = migrateCatalogFavoritesToScopedRows(realm, 'user:user-1', { migratedAt });
    const second = migrateCatalogFavoritesToScopedRows(realm, 'user:user-1', { migratedAt });

    expect(first).toEqual(
      expect.objectContaining({
        migrated: true,
        total: 6,
      })
    );
    expect(first.countsByEntityType).toEqual(
      expect.objectContaining({
        [UserFavoriteEntityType.Artist]: 1,
        [UserFavoriteEntityType.Show]: 1,
        [UserFavoriteEntityType.Source]: 1,
        [UserFavoriteEntityType.Track]: 1,
        [UserFavoriteEntityType.Tour]: 1,
        [UserFavoriteEntityType.Song]: 1,
      })
    );
    expect(second).toEqual({ migrated: false, total: 0, countsByEntityType: {} });
    expect(realm.objects(UserFavorite).length).toBe(6);
    expect(
      realm.objectForPrimaryKey(
        UserFavorite,
        userFavoriteScopedId('user:user-1', UserFavoriteEntityType.Track, 'track-1')
      )
    ).toEqual(
      expect.objectContaining({
        entityType: UserFavoriteEntityType.Track,
        entityUuid: 'track-1',
        deletedAt: null,
      })
    );
    const artist = realm.objects('Artist').filtered('uuid == $0', 'artist-1')[0] as unknown as {
      isFavorite: boolean;
    };
    expect(artist.isFavorite).toBe(true);
    expect(realm.objects(UserDataMigrationMarker).length).toBe(1);
  });
});

describe('catalogFavoriteDescriptorForObject', () => {
  it('maps catalog model names to server favorite entity types', () => {
    expect(
      catalogFavoriteDescriptorForObject({
        uuid: 'track-1',
        constructor: { schema: { name: 'SourceTrack' } },
      })
    ).toEqual({
      entityType: UserFavoriteEntityType.Track,
      entityUuid: 'track-1',
    });
    expect(
      catalogFavoriteDescriptorForObject({
        uuid: 'venue-1',
        constructor: { schema: { name: 'Venue' } },
      })
    ).toBeUndefined();
  });
});

describe('UserLibraryFavoriteMutationService', () => {
  let realm: Realm;
  let tempDir: string;
  let putJson: ReturnType<typeof vi.fn>;
  let deleteJson: ReturnType<typeof vi.fn>;
  let service: UserLibraryFavoriteMutationService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-favorite-mutation-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema,
      schemaVersion: 1,
    });
    putJson = vi.fn(async () => favoriteResponse('artist'));
    deleteJson = vi.fn(async () => undefined);
    service = new UserLibraryFavoriteMutationService(
      realm,
      {
        putJson,
        deleteJson,
      } as unknown as RelistenUserLibraryApiClient,
      {
        withAuthenticatedSessionRetry: vi.fn(async (request, options) => {
          expect(options).toEqual({ expectedScopeId: SCOPE_ID });
          return request({ accessToken: 'access-1', scopeId: SCOPE_ID });
        }),
      }
    );
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('sets signed-in favorites through scoped rows and authenticated API calls', async () => {
    await service.setFavorite(SCOPE_ID, UserFavoriteEntityType.Artist, 'artist-1', true, {
      now: new Date('2026-06-20T06:40:00.000Z'),
    });

    expect(putJson).toHaveBeenCalledWith(
      '/favorites/artist/artist-1',
      {},
      {
        accessToken: 'access-1',
      }
    );
    expect(isActiveScopedFavorite(realm, SCOPE_ID, UserFavoriteEntityType.Artist, 'artist-1')).toBe(
      true
    );
    expect(
      realm.objectForPrimaryKey(
        UserFavorite,
        userFavoriteScopedId(SCOPE_ID, UserFavoriteEntityType.Artist, 'artist-1')
      )
    ).toEqual(
      expect.objectContaining({
        createdAt: new Date('2026-06-20T04:40:00.000Z'),
        updatedAt: new Date('2026-06-20T04:41:00.000Z'),
        deletedAt: null,
      })
    );
  });

  it('rolls back a newly created optimistic favorite when the server mutation fails', async () => {
    putJson.mockRejectedValueOnce(new Error('network failed'));

    await expect(
      service.setFavorite(SCOPE_ID, UserFavoriteEntityType.Artist, 'artist-1', true, {
        now: new Date('2026-06-20T06:40:00.000Z'),
      })
    ).rejects.toThrow('network failed');

    expect(
      realm.objectForPrimaryKey(
        UserFavorite,
        userFavoriteScopedId(SCOPE_ID, UserFavoriteEntityType.Artist, 'artist-1')
      )
    ).toBeNull();
  });

  it('rolls back optimistic state when no authenticated session is available', async () => {
    service = new UserLibraryFavoriteMutationService(
      realm,
      {
        putJson,
        deleteJson,
      } as unknown as RelistenUserLibraryApiClient,
      {
        withAuthenticatedSessionRetry: vi.fn(async (request) => request(undefined)),
      }
    );

    await expect(
      service.setFavorite(SCOPE_ID, UserFavoriteEntityType.Artist, 'artist-1', true, {
        now: new Date('2026-06-20T06:40:00.000Z'),
      })
    ).rejects.toMatchObject({
      code: 'missing_auth_session',
      name: 'UserLibraryFavoriteMutationError',
    });

    expect(putJson).not.toHaveBeenCalled();
    expect(
      realm.objectForPrimaryKey(
        UserFavorite,
        userFavoriteScopedId(SCOPE_ID, UserFavoriteEntityType.Artist, 'artist-1')
      )
    ).toBeNull();
  });

  it('rolls failed deletes back to the previous scoped favorite state', async () => {
    setScopedFavoriteState(realm, SCOPE_ID, UserFavoriteEntityType.Artist, 'artist-1', true, {
      now: new Date('2026-06-20T06:40:00.000Z'),
    });
    deleteJson.mockRejectedValueOnce(new Error('delete failed'));

    await expect(
      service.setFavorite(SCOPE_ID, UserFavoriteEntityType.Artist, 'artist-1', false, {
        now: new Date('2026-06-20T06:41:00.000Z'),
      })
    ).rejects.toThrow('delete failed');

    expect(deleteJson).toHaveBeenCalledWith('/favorites/artist/artist-1', {
      accessToken: 'access-1',
    });
    expect(isActiveScopedFavorite(realm, SCOPE_ID, UserFavoriteEntityType.Artist, 'artist-1')).toBe(
      true
    );
  });
});
