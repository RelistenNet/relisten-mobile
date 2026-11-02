/// <reference types="node" />
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

import type {
  FavoriteAccountScopeCapture,
  FavoriteAccountScopeSource,
} from './favorite_repository';
import { favoriteTargetForCatalogId } from './favorite_catalog_target';
import { FavoriteMembershipProjection } from './favorite_membership_projection';
import { UserFavorite } from '@/relisten/realm/models/library/user_favorite';

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
        UserFavorite,
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
        { name: 'Source', primaryKey: 'uuid', properties: { uuid: 'string', showUuid: 'string?' } },
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
