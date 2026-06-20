import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryIndex } from '@/relisten/realm/library_index';
import {
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { ACTIVE_USER_DATA_SCOPE_KEY } from '@/relisten/realm/models/user_library';
import { UserFavoriteEntityType } from '@/relisten/realm/models/user_library/library';
import { UserDataScopeKind } from '@/relisten/user_library/user_data_scope';

const schema: Realm.ObjectSchema[] = [
  favoriteCatalogSchema('Artist'),
  {
    name: 'Show',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      artistUuid: 'string',
      yearUuid: 'string',
      isFavorite: { type: 'bool', default: false },
    },
  },
  favoriteCatalogSchema('Song'),
  {
    name: 'Source',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      showUuid: 'string',
      artistUuid: 'string',
      isFavorite: { type: 'bool', default: false },
    },
  },
  favoriteCatalogSchema('Tour'),
  {
    name: 'SourceTrackOfflineInfo',
    primaryKey: 'sourceTrackUuid',
    properties: {
      sourceTrackUuid: 'string',
      status: 'int',
      type: 'int',
      sourceTracks: {
        type: 'linkingObjects',
        objectType: 'SourceTrack',
        property: 'offlineInfo',
      },
    },
  },
  {
    name: 'SourceTrack',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      artistUuid: 'string',
      showUuid: 'string',
      sourceUuid: 'string',
      offlineInfo: 'SourceTrackOfflineInfo?',
    },
  },
  {
    name: 'ActiveUserDataScope',
    primaryKey: 'key',
    properties: {
      key: 'string',
      scopeId: 'string',
      scopeKind: 'string',
    },
  },
  {
    name: 'UserFavorite',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: 'string',
      entityType: 'string',
      entityUuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: 'date?',
    },
  },
];

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

function favoriteScopedId(scopeId: string, entityType: UserFavoriteEntityType, entityUuid: string) {
  return `${scopeId}:favorite:${entityType}:${entityUuid}`;
}

function createUserFavorite(
  realm: Realm,
  scopeId: string,
  entityType: UserFavoriteEntityType,
  entityUuid: string,
  deletedAt: Date | null = null
) {
  const now = new Date('2026-06-20T18:30:00.000Z');
  realm.create('UserFavorite', {
    scopedId: favoriteScopedId(scopeId, entityType, entityUuid),
    scopeId,
    entityType,
    entityUuid,
    createdAt: now,
    updatedAt: now,
    deletedAt,
  });
}

function createOfflineTrack(
  realm: Realm,
  trackUuid: string,
  showUuid: string,
  artistUuid: string,
  type: SourceTrackOfflineInfoType
) {
  const offlineInfo = realm.create('SourceTrackOfflineInfo', {
    sourceTrackUuid: trackUuid,
    status: SourceTrackOfflineInfoStatus.Succeeded,
    type,
  });
  realm.create('SourceTrack', {
    uuid: trackUuid,
    artistUuid,
    showUuid,
    sourceUuid: `source-${trackUuid}`,
    offlineInfo,
  });
}

async function waitForCondition(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  expect(predicate()).toBe(true);
}

describe('LibraryIndex favorite membership', () => {
  let realm: Realm;
  let tempDir: string;
  let libraryIndex: LibraryIndex | undefined;

  beforeEach(() => {
    vi.stubGlobal('__DEV__', true);
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-library-index-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema,
      schemaVersion: 1,
    });
  });

  afterEach(() => {
    libraryIndex?.tearDown();
    libraryIndex = undefined;
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('uses catalog favorite flags when the active scope is anonymous', () => {
    realm.write(() => {
      realm.create('ActiveUserDataScope', {
        key: ACTIVE_USER_DATA_SCOPE_KEY,
        scopeId: 'anonymous:device-1',
        scopeKind: UserDataScopeKind.Anonymous,
      });
      realm.create('Artist', { uuid: 'artist-1', isFavorite: true });
      realm.create('Show', {
        uuid: 'show-1',
        artistUuid: 'artist-1',
        yearUuid: 'year-1',
        isFavorite: true,
      });
      realm.create('Song', { uuid: 'song-1', isFavorite: true });
      realm.create('Source', {
        uuid: 'source-1',
        artistUuid: 'artist-1',
        showUuid: 'show-1',
        isFavorite: true,
      });
      realm.create('Tour', { uuid: 'tour-1', isFavorite: true });
    });

    libraryIndex = new LibraryIndex(realm);

    expect(libraryIndex.artistIsFavorite('artist-1')).toBe(true);
    expect(libraryIndex.showIsFavorite('show-1')).toBe(true);
    expect(libraryIndex.songIsFavorite('song-1')).toBe(true);
    expect(libraryIndex.sourceIsFavorite('source-1')).toBe(true);
    expect(libraryIndex.tourIsFavorite('tour-1')).toBe(true);
    expect(libraryIndex.showIsInLibrary('show-1')).toBe(true);
    expect(libraryIndex.artistIsInLibrary('artist-1')).toBe(true);
    expect(libraryIndex.yearIsInLibrary('year-1')).toBe(true);
  });

  it('uses only the active authenticated scope favorite rows when signed in', () => {
    realm.write(() => {
      realm.create('ActiveUserDataScope', {
        key: ACTIVE_USER_DATA_SCOPE_KEY,
        scopeId: 'user:user-1',
        scopeKind: UserDataScopeKind.Authenticated,
      });
      realm.create('Artist', { uuid: 'legacy-artist', isFavorite: true });
      realm.create('Show', {
        uuid: 'legacy-show',
        artistUuid: 'legacy-artist',
        yearUuid: 'legacy-year',
        isFavorite: true,
      });
      realm.create('Source', {
        uuid: 'legacy-source',
        artistUuid: 'legacy-artist',
        showUuid: 'legacy-show',
        isFavorite: true,
      });
      realm.create('Song', { uuid: 'legacy-song', isFavorite: true });
      realm.create('Tour', { uuid: 'legacy-tour', isFavorite: true });
      realm.create('Show', {
        uuid: 'show-1',
        artistUuid: 'artist-1',
        yearUuid: 'year-1',
        isFavorite: false,
      });
      realm.create('Show', {
        uuid: 'show-from-source',
        artistUuid: 'artist-2',
        yearUuid: 'year-2',
        isFavorite: false,
      });
      realm.create('Source', {
        uuid: 'source-1',
        artistUuid: 'artist-2',
        showUuid: 'show-from-source',
        isFavorite: false,
      });
      createUserFavorite(realm, 'user:user-1', UserFavoriteEntityType.Artist, 'artist-1');
      createUserFavorite(realm, 'user:user-1', UserFavoriteEntityType.Show, 'show-1');
      createUserFavorite(realm, 'user:user-1', UserFavoriteEntityType.Song, 'song-1');
      createUserFavorite(realm, 'user:user-1', UserFavoriteEntityType.Source, 'source-1');
      createUserFavorite(realm, 'user:user-1', UserFavoriteEntityType.Tour, 'tour-1');
      createUserFavorite(realm, 'user:user-2', UserFavoriteEntityType.Artist, 'other-artist');
      createUserFavorite(
        realm,
        'user:user-1',
        UserFavoriteEntityType.Artist,
        'deleted-artist',
        new Date('2026-06-20T18:35:00.000Z')
      );
    });

    libraryIndex = new LibraryIndex(realm);

    expect(libraryIndex.artistIsFavorite('legacy-artist')).toBe(false);
    expect(libraryIndex.showIsFavorite('legacy-show')).toBe(false);
    expect(libraryIndex.songIsFavorite('legacy-song')).toBe(false);
    expect(libraryIndex.sourceIsFavorite('legacy-source')).toBe(false);
    expect(libraryIndex.tourIsFavorite('legacy-tour')).toBe(false);
    expect(libraryIndex.artistIsFavorite('other-artist')).toBe(false);
    expect(libraryIndex.artistIsFavorite('deleted-artist')).toBe(false);

    expect(libraryIndex.artistIsFavorite('artist-1')).toBe(true);
    expect(libraryIndex.showIsFavorite('show-1')).toBe(true);
    expect(libraryIndex.songIsFavorite('song-1')).toBe(true);
    expect(libraryIndex.sourceIsFavorite('source-1')).toBe(true);
    expect(libraryIndex.tourIsFavorite('tour-1')).toBe(true);
    expect(libraryIndex.showIsInLibrary('show-1')).toBe(true);
    expect(libraryIndex.showIsInLibrary('show-from-source')).toBe(true);
    expect(libraryIndex.artistIsInLibrary('artist-2')).toBe(true);
    expect(libraryIndex.yearIsInLibrary('year-2')).toBe(true);
  });

  it('links scoped source favorites to parent shows when catalog source rows load later', async () => {
    realm.write(() => {
      realm.create('ActiveUserDataScope', {
        key: ACTIVE_USER_DATA_SCOPE_KEY,
        scopeId: 'user:user-1',
        scopeKind: UserDataScopeKind.Authenticated,
      });
      createUserFavorite(realm, 'user:user-1', UserFavoriteEntityType.Source, 'source-late');
    });
    libraryIndex = new LibraryIndex(realm);

    expect(libraryIndex.sourceIsFavorite('source-late')).toBe(true);
    expect(libraryIndex.showIsInLibrary('show-late')).toBe(false);

    realm.write(() => {
      realm.create('Show', {
        uuid: 'show-late',
        artistUuid: 'artist-late',
        yearUuid: 'year-late',
        isFavorite: false,
      });
      realm.create('Source', {
        uuid: 'source-late',
        artistUuid: 'artist-late',
        showUuid: 'show-late',
        isFavorite: false,
      });
    });
    await waitForCondition(() => libraryIndex?.showIsInLibrary('show-late') === true);

    expect(libraryIndex.showIsInLibrary('show-late')).toBe(true);
    expect(libraryIndex.artistIsInLibrary('artist-late')).toBe(true);
    expect(libraryIndex.yearIsInLibrary('year-late')).toBe(true);
  });

  it('keeps streaming cache out of library membership while preserving offline availability', () => {
    realm.write(() => {
      realm.create('Show', {
        uuid: 'show-cache',
        artistUuid: 'artist-cache',
        yearUuid: 'year-cache',
        isFavorite: false,
      });
      realm.create('Show', {
        uuid: 'show-download',
        artistUuid: 'artist-download',
        yearUuid: 'year-download',
        isFavorite: false,
      });
      createOfflineTrack(
        realm,
        'track-cache',
        'show-cache',
        'artist-cache',
        SourceTrackOfflineInfoType.StreamingCache
      );
      createOfflineTrack(
        realm,
        'track-download',
        'show-download',
        'artist-download',
        SourceTrackOfflineInfoType.UserInitiated
      );
    });

    libraryIndex = new LibraryIndex(realm);

    expect(libraryIndex.showHasOfflineTracks('show-cache')).toBe(true);
    expect(libraryIndex.showIsInLibrary('show-cache')).toBe(false);
    expect(libraryIndex.artistIsInLibrary('artist-cache')).toBe(false);
    expect(libraryIndex.yearIsInLibrary('year-cache')).toBe(false);

    expect(libraryIndex.showHasOfflineTracks('show-download')).toBe(true);
    expect(libraryIndex.showIsInLibrary('show-download')).toBe(true);
    expect(libraryIndex.artistIsInLibrary('artist-download')).toBe(true);
    expect(libraryIndex.yearIsInLibrary('year-download')).toBe(true);
  });
});
