/// <reference types="node" />
import Realm from 'realm';
import { CatalogRedirect } from '@/relisten/realm/catalog_identity';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({ log: { extend: () => ({ warn: vi.fn() }) } }));
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

import type {
  FavoriteAccountScopeCapture,
  FavoriteAccountScopeSource,
} from './favorite_repository';
import { setCatalogFavorite, favoriteTargetForCatalogId } from './favorite_catalog_target';
import { FavoriteMembershipProjection } from './favorite_membership_projection';
import { UserFavorite } from '@/relisten/realm/models/library/user_favorite';
import { NormalizedVenue, NormalizedVenueName } from '@/relisten/realm/models/catalog';
import { FavoriteRepository } from './favorite_repository';
import { useFavorite } from './favorite_hooks';
import { FAVORITE_REALM_MODELS, FavoriteMutation } from '@/relisten/realm/models/library';

const hookContext = vi.hoisted(() => ({
  repository: undefined as FavoriteRepository | undefined,
  projection: undefined as FavoriteMembershipProjection | undefined,
}));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
vi.mock('@/relisten/accounts/account_context', () => ({}));
vi.mock('@/relisten/accounts/auth/installation_id', () => ({}));
vi.mock('@/relisten/realm/schema', () => ({}));
vi.mock('@/relisten/realm/root_services', () => ({
  useFavoriteRepository: () => hookContext.repository!,
  useRootLibraryIndex: () => ({
    subscribeLibraryMembership: hookContext.projection!.subscribe,
    isFavorite: (kind: Parameters<FavoriteMembershipProjection['isFavorite']>[0], id: string) =>
      hookContext.projection!.isFavorite(kind, id),
  }),
}));

const artistUuid = '00000000-0000-4000-8000-000000000001';
const importedVenueArtistUuid = '00000000-0000-4000-8000-000000000002';
const importedVenueUuid = '00000000-0000-4000-8000-000000000003';

class MutableAccountScope implements FavoriteAccountScopeSource {
  private readonly listeners = new Set<() => void>();
  private generation = 0;

  constructor(private scopeId: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  capture = (): FavoriteAccountScopeCapture => ({
    scopeId: this.scopeId,
    generation: this.generation,
  });

  isCurrent = (capture: FavoriteAccountScopeCapture) =>
    capture.scopeId === this.scopeId && capture.generation === this.generation;

  select(scopeId: string) {
    this.scopeId = scopeId;
    this.generation += 1;
    for (const listener of this.listeners) listener();
  }
}

describe('FavoriteMembershipProjection canonical targets', () => {
  let directory: string;
  let realm: Realm;
  let accountScope: MutableAccountScope;
  let projection: FavoriteMembershipProjection;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-favorite-projection-'));
    realm = new Realm({
      path: join(directory, 'favorites.realm'),
      schema: [
        ...FAVORITE_REALM_MODELS,
        CatalogRedirect,
        NormalizedVenue,
        NormalizedVenueName,
        { name: 'Artist', primaryKey: 'uuid', properties: { uuid: 'string' } },
        {
          name: 'Show',
          primaryKey: 'uuid',
          properties: {
            uuid: 'string',
            artistUuid: 'string?',
            yearUuid: 'string?',
            artist: 'Artist?',
          },
        },
        {
          name: 'Source',
          primaryKey: 'uuid',
          properties: { uuid: 'string', showUuid: 'string?' },
        },
        {
          name: 'SourceTrack',
          primaryKey: 'uuid',
          properties: { uuid: 'string', showUuid: 'string?' },
        },
        {
          name: 'Song',
          primaryKey: 'uuid',
          properties: { uuid: 'string', artistUuid: 'string?' },
        },
        {
          name: 'NormalizedSong',
          primaryKey: 'id',
          properties: { id: 'string', artistUuid: 'string?' },
        },
        {
          name: 'Tour',
          primaryKey: 'uuid',
          properties: { uuid: 'string', artistUuid: 'string?' },
        },
        {
          name: 'Venue',
          primaryKey: 'uuid',
          properties: { uuid: 'string', artistUuid: 'string?' },
        },
      ],
    });
    accountScope = new MutableAccountScope('scope-a');
  });

  afterEach(() => {
    projection?.tearDown();
    if (!realm.isClosed) realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('keeps canonical membership while deriving only the owning song artist', () => {
    realm.write(() => {
      realm.create('NormalizedSong', { id: 'song_hzk4tx63', artistUuid });
      realm.create('Venue', { uuid: importedVenueUuid, artistUuid: importedVenueArtistUuid });
      addFavorite('scope-a', favoriteTargetForCatalogId('song', 'song_hzk4tx63'));
      addFavorite('scope-a', favoriteTargetForCatalogId('venue', 'venue_fp4h900f'));
      addFavorite('scope-a', favoriteTargetForCatalogId('imported_venue', importedVenueUuid));
      addFavorite('scope-b', favoriteTargetForCatalogId('venue', 'venue_0abc1234'));
    });

    projection = new FavoriteMembershipProjection(realm, accountScope);

    expect(projection.favoriteUuids('song')).toEqual(new Set(['song_hzk4tx63']));
    expect(projection.favoriteUuids('venue')).toEqual(new Set(['venue_fp4h900f']));
    expect(projection.favoriteUuids('imported_venue')).toEqual(new Set([importedVenueUuid]));
    expect(new Set(projection.libraryArtistUuids())).toEqual(
      new Set([artistUuid, importedVenueArtistUuid])
    );
    expect(projection.favoriteShowUuidsForLibrary()).toEqual(new Set());

    accountScope.select('scope-b');

    expect(projection.favoriteUuids('song')).toEqual(new Set());
    expect(projection.favoriteUuids('venue')).toEqual(new Set(['venue_0abc1234']));
    expect(new Set(projection.libraryArtistUuids())).toEqual(new Set());
  });

  it('derives a redirected song artist without rewriting saved membership', async () => {
    realm.write(() => {
      realm.create('NormalizedSong', { id: 'song_hzk4tx63', artistUuid });
      addFavorite('scope-a', favoriteTargetForCatalogId('song', 'song_0abc1234'));
    });
    projection = new FavoriteMembershipProjection(realm, accountScope);
    expect(new Set(projection.libraryArtistUuids())).toEqual(new Set());
    realm.write(() => {
      realm.create(CatalogRedirect, { id: 'song_0abc1234', targetId: 'song_hzk4tx63' });
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await vi.waitFor(() =>
      expect(new Set(projection.libraryArtistUuids())).toEqual(new Set([artistUuid]))
    );
    expect(projection.favoriteUuids('song')).toEqual(new Set(['song_hzk4tx63']));
    expect(projection.isFavorite('song', 'song_0abc1234')).toBe(true);
    expect(realm.objects(UserFavorite)[0].targetId).toBe('song_0abc1234');
    accountScope.select('scope-b');
    expect(new Set(projection.libraryArtistUuids())).toEqual(new Set());
  });

  it('routes canonical UI unfavorite to all saved alias targets and preserves another account', async () => {
    realm.write(() => {
      realm.create(CatalogRedirect, { id: 'venue_0abc1234', targetId: 'venue_fp4h900f' });
      realm.create(CatalogRedirect, { id: 'venue_0abc5678', targetId: 'venue_fp4h900f' });
      addFavorite('scope-a', { kind: 'venue', id: 'venue_0abc1234' });
      addFavorite('scope-a', { kind: 'venue', id: 'venue_0abc5678' });
      addFavorite('scope-b', { kind: 'venue', id: 'venue_0abc1234' });
    });
    hookContext.repository = new FavoriteRepository(realm, accountScope);
    projection = new FavoriteMembershipProjection(realm, accountScope);
    hookContext.projection = projection;
    const favorite = useFavorite('venue', 'venue_fp4h900f');
    expect(favorite.isFavorite).toBe(true);
    expect([...projection.favoriteUuids('venue')]).toEqual(['venue_fp4h900f']);
    favorite.setFavorite(true);
    expect(realm.objects(UserFavorite)).toHaveLength(3);
    expect(realm.objects(FavoriteMutation)).toHaveLength(0);
    favorite.toggleFavorite();
    expect(
      realm.objects(UserFavorite).filtered('scopeId == "scope-a" AND effectivePresent == true')
    ).toHaveLength(0);
    expect(
      realm.objects(UserFavorite).filtered('scopeId == "scope-b" AND effectivePresent == true')
    ).toHaveLength(1);
    expect(
      realm
        .objects(FavoriteMutation)
        .map((m) => m.targetId)
        .sort()
    ).toEqual(['venue_0abc1234', 'venue_0abc5678']);
    expect(realm.objects(FavoriteMutation).map((m) => m.desiredPresent)).toEqual([false, false]);
  });

  it('resolves a merged venue once while retaining its original saved favorite', async () => {
    realm.write(() => {
      addFavorite('scope-a', { kind: 'venue', id: 'venue_0abc1234' });
      realm.create(NormalizedVenue, {
        id: 'venue_fp4h900f',
        name: 'After merge',
        kind: 'room',
        globalShowCount: 0,
      });
    });
    projection = new FavoriteMembershipProjection(realm, accountScope);
    realm.write(() =>
      realm.create(CatalogRedirect, { id: 'venue_0abc1234', targetId: 'venue_fp4h900f' })
    );
    await vi.waitFor(() =>
      expect([...projection!.favoriteUuids('venue')]).toEqual(['venue_fp4h900f'])
    );
    expect(projection.isFavorite('venue', 'venue_fp4h900f')).toBe(true);
    expect(realm.objects(UserFavorite)[0].targetId).toBe('venue_0abc1234');
    setCatalogFavorite(
      new FavoriteRepository(realm, accountScope),
      'venue',
      'venue_fp4h900f',
      false
    );
    await vi.waitFor(() => expect([...projection!.favoriteUuids('venue')]).toEqual([]));
  });

  it('removes the current account saved aliases after a scope change', () => {
    realm.write(() => {
      realm.create(CatalogRedirect, { id: 'venue_0abc1234', targetId: 'venue_fp4h900f' });
      addFavorite('scope-a', { kind: 'venue', id: 'venue_0abc1234' });
      addFavorite('scope-b', { kind: 'venue', id: 'venue_fp4h900f' });
    });
    const repository = new FavoriteRepository(realm, accountScope);
    projection = new FavoriteMembershipProjection(realm, accountScope);
    accountScope.select('scope-b');
    setCatalogFavorite(repository, 'venue', 'venue_fp4h900f', false);
    expect(realm.objects(UserFavorite).filtered('scopeId == "scope-a"')[0].effectivePresent).toBe(
      true
    );
    expect(
      realm.objects(FavoriteMutation).map((mutation) => [mutation.scopeId, mutation.targetId])
    ).toEqual([['scope-b', 'venue_fp4h900f']]);
  });

  function addFavorite(scopeId: string, target: { kind: UserFavorite['targetKind']; id: string }) {
    const now = new Date('2026-11-01T12:00:00Z');
    realm.create(UserFavorite, {
      favoriteId: `${scopeId}:${target.kind}:${target.id}`,
      scopeId,
      targetKind: target.kind,
      targetId: target.id,
      acknowledgedPresent: true,
      effectivePresent: true,
      acknowledgedRevision: 1,
      lastLocalSequence: 0,
      serverCreatedAt: now,
      serverUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
});
