/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FavoriteSyncAdapter } from './favorite_sync_adapter';
import {
  FavoriteAccountScopeCapture,
  FavoriteAccountScopeSource,
  FavoriteRepository,
  StaleFavoriteAccountScopeError,
} from './favorite_repository';
import { favoriteTargetForCatalogUuid } from './favorite_catalog_target';
import {
  FAVORITE_REALM_MODELS,
  FavoriteMutation,
  FavoriteMutationState,
  FavoriteSyncState,
  UserFavorite,
} from '@/relisten/realm/models/library';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const userA = formatUuidTypedId('user', '01890a5d-ac96-774b-bcce-b302099a8051');
const userB = formatUuidTypedId('user', '01890a5d-ac96-774b-bcce-b302099a8052');
const catalogTarget = favoriteTargetForCatalogUuid(
  'artist',
  '8bf22e27-11de-96e8-4653-964ff9faae2d'
);

class MutableAccountScope implements FavoriteAccountScopeSource {
  private current: FavoriteAccountScopeCapture = { scopeId: userA, generation: 1 };

  subscribe() {
    return () => {};
  }

  capture() {
    return this.current;
  }

  isCurrent(capture: FavoriteAccountScopeCapture) {
    return (
      capture.scopeId === this.current.scopeId && capture.generation === this.current.generation
    );
  }

  switchTo(scopeId: string) {
    this.current = { scopeId, generation: this.current.generation + 1 };
  }
}

describe('typed favorite sync adapter', () => {
  let directory: string;
  let realm: Realm;
  let scope: MutableAccountScope;
  let repository: FavoriteRepository;
  let adapter: FavoriteSyncAdapter;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-favorite-sync-'));
    realm = await Realm.open({
      path: join(directory, 'favorites.realm'),
      schemaVersion: 1,
      schema: [...FAVORITE_REALM_MODELS],
    });
    scope = new MutableAccountScope();
    repository = new FavoriteRepository(realm, scope);
    adapter = new FavoriteSyncAdapter(repository);
  });

  afterEach(() => {
    if (!realm.isClosed) {
      realm.close();
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it('reuses the complete request after an ambiguous retryable failure', () => {
    const firstAttemptAt = new Date('2026-10-31T12:00:00Z');
    const retryAt = new Date('2026-10-31T12:00:30Z');
    const canonicalFavoriteId = formatUuidTypedId(
      'favorite',
      '01890a5d-ac96-774b-bcce-b302099a8062'
    );
    repository.setFavorite({ ...catalogTarget, isFavorite: true }, { now: firstAttemptAt });

    const firstBatch = adapter.prepareMutationBatch(scope.capture(), 100, firstAttemptAt);
    expect(firstBatch).toBeDefined();
    if (!firstBatch) {
      throw new Error('Expected a favorite mutation batch.');
    }
    expect(firstBatch.request).toEqual({
      contract_version: 1,
      mutations: [
        {
          mutation_id: expect.stringMatching(/^mutation_/),
          favorite_id: expect.stringMatching(/^favorite_/),
          target: catalogTarget,
          desired_state: 'favorite',
        },
      ],
    });

    adapter.releaseMutationBatch(
      firstBatch.capture,
      firstBatch.mutationIds,
      {
        code: 'network_timeout',
        message: 'The response may have been lost after the server committed the batch.',
        retryable: true,
      },
      retryAt,
      firstAttemptAt
    );
    adapter.applySnapshot(
      scope.capture(),
      {
        contract_version: 1,
        library_revision: 2,
        next_cursor: 'canonical-membership-cursor',
        favorites: [
          {
            favorite_id: canonicalFavoriteId,
            target: catalogTarget,
            created_at: '2026-10-31T11:59:00Z',
            updated_at: '2026-10-31T12:00:15Z',
          },
        ],
      },
      new Date('2026-10-31T12:00:15Z')
    );

    const retryBatch = adapter.prepareMutationBatch(scope.capture(), 100, retryAt);
    expect(retryBatch).toBeDefined();
    expect(retryBatch?.mutationIds).toEqual(firstBatch.mutationIds);
    expect(retryBatch?.request).toEqual(firstBatch.request);
    expect(realm.objects(FavoriteMutation)[0].attemptCount).toBe(2);
  });

  it('applies a receipt with complete typed IDs', async () => {
    repository.setFavorite({ ...catalogTarget, isFavorite: true });

    await adapter.syncNextBatch({
      sendFavoriteMutations: async (request) => {
        const submitted = request.mutations[0];
        if (submitted.desired_state !== 'favorite') {
          throw new Error('Expected a favorite mutation.');
        }
        return {
          contract_version: 1,
          library_revision: 3,
          results: [
            {
              mutation_id: submitted.mutation_id,
              target: submitted.target,
              desired_state: submitted.desired_state,
              changed: false,
              submitted_favorite_id: submitted.favorite_id,
              canonical_favorite_id: submitted.favorite_id,
              library_revision: 3,
            },
          ],
        };
      },
    });

    expect(realm.objects(FavoriteMutation)).toHaveLength(0);
    expect(realm.objects(UserFavorite)[0]).toMatchObject({
      favoriteId: expect.stringMatching(/^favorite_/),
      scopeId: userA,
      targetKind: catalogTarget.kind,
      targetId: catalogTarget.id,
      acknowledgedPresent: true,
      effectivePresent: true,
      acknowledgedRevision: 3,
    });
    expect(realm.objects(FavoriteSyncState)[0].highestObservedLibraryRevision).toBe(3);
  });

  it('rejects a late response after account switch without applying it', async () => {
    repository.setFavorite({ ...catalogTarget, isFavorite: true });
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let requestStarted!: () => void;
    const requestStart = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });

    const sync = adapter.syncNextBatch({
      sendFavoriteMutations: async (request) => {
        requestStarted();
        await responseGate;
        const submitted = request.mutations[0];
        if (submitted.desired_state !== 'favorite') {
          throw new Error('Expected a favorite mutation.');
        }
        return {
          contract_version: 1,
          library_revision: 4,
          results: [
            {
              mutation_id: submitted.mutation_id,
              target: submitted.target,
              desired_state: submitted.desired_state,
              changed: true,
              submitted_favorite_id: submitted.favorite_id,
              canonical_favorite_id: submitted.favorite_id,
              library_revision: 4,
            },
          ],
        };
      },
    });

    await requestStart;
    scope.switchTo(userB);
    releaseResponse();

    await expect(sync).rejects.toBeInstanceOf(StaleFavoriteAccountScopeError);
    expect(realm.objects(UserFavorite)[0]).toMatchObject({
      scopeId: userA,
      acknowledgedPresent: false,
      acknowledgedRevision: null,
    });
    expect(realm.objects(FavoriteMutation)[0].state).toBe(FavoriteMutationState.InFlight);
    expect(realm.objects(FavoriteSyncState)[0].highestObservedLibraryRevision).toBe(0);
  });

  it('stores normalized membership even though the v3 catalog cannot resolve it', () => {
    const favoriteId = formatUuidTypedId('favorite', '01890a5d-ac96-774b-bcce-b302099a8061');

    adapter.applySnapshot(scope.capture(), {
      contract_version: 1,
      library_revision: 8,
      next_cursor: 'opaque-normalized-cursor',
      favorites: [
        {
          favorite_id: favoriteId,
          target: { kind: 'song', id: 'song_62mhvjyd' },
          created_at: '2026-10-31T12:00:00Z',
          updated_at: '2026-10-31T12:00:00Z',
        },
      ],
    });

    expect(realm.objectForPrimaryKey(UserFavorite, favoriteId)).toMatchObject({
      scopeId: userA,
      targetKind: 'song',
      targetId: 'song_62mhvjyd',
      acknowledgedPresent: true,
      effectivePresent: true,
    });
    expect(realm.objects(FavoriteSyncState)[0]).toMatchObject({
      libraryCursor: 'opaque-normalized-cursor',
      highestObservedLibraryRevision: 8,
    });
  });
});
