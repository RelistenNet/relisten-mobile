import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({ getRandomValues: (value: Uint8Array) => value }));
import { favoriteTargetForCatalogUuid } from './favorite_catalog_target';
import {
  FavoriteMutationBatchRequest,
  FavoriteMutationBatchResponse,
  validateFavoriteChanges,
  validateFavoriteMutationResponse,
  validateFavoriteSnapshot,
} from './favorite_sync_contract';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';

const target = favoriteTargetForCatalogUuid('artist', '8bf22e27-11de-96e8-4653-964ff9faae2d');
const mutationId = formatUuidTypedId('mutation', '01890a5d-ac96-774b-bcce-b302099a8057');
const favoriteId = formatUuidTypedId('favorite', '01890a5d-ac96-774b-bcce-b302099a8058');
const canonicalFavoriteId = formatUuidTypedId('favorite', '01890a5d-ac96-774b-bcce-b302099a8059');

const request: FavoriteMutationBatchRequest = {
  contract_version: 1,
  mutations: [
    {
      mutation_id: mutationId,
      target,
      desired_state: 'favorite',
      favorite_id: favoriteId,
    },
  ],
};

const response: FavoriteMutationBatchResponse = {
  contract_version: 1,
  library_revision: 4,
  results: [
    {
      mutation_id: mutationId,
      target,
      desired_state: 'favorite',
      changed: false,
      submitted_favorite_id: favoriteId,
      canonical_favorite_id: canonicalFavoriteId,
      library_revision: 4,
    },
  ],
};

describe('typed favorite sync contract', () => {
  it('accepts an exact retry receipt with complete typed identities', () => {
    expect(() => validateFavoriteMutationResponse(request, response)).not.toThrow();
  });

  it('rejects a valid receipt applied to a different exact target', () => {
    const mismatched = structuredClone(response);
    mismatched.results[0].target = favoriteTargetForCatalogUuid(
      'show',
      '8bf22e27-11de-96e8-4653-964ff9faae2d'
    );

    expect(() => validateFavoriteMutationResponse(request, mismatched)).toThrow(
      'does not match its submitted mutation'
    );
  });

  it('accepts unresolved normalized membership in snapshots and changes', () => {
    const normalizedTarget = { kind: 'song' as const, id: 'song_62mhvjyd' };
    const changedAt = '2026-10-31T12:00:00Z';

    expect(() =>
      validateFavoriteSnapshot({
        contract_version: 1,
        library_revision: 5,
        next_cursor: 'opaque',
        favorites: [
          {
            favorite_id: favoriteId,
            target: normalizedTarget,
            created_at: changedAt,
            updated_at: changedAt,
          },
        ],
      })
    ).not.toThrow();

    expect(() =>
      validateFavoriteChanges({
        contract_version: 1,
        library_revision: 6,
        next_cursor: 'opaque-next',
        has_more: false,
        changes: [
          {
            change_id: formatUuidTypedId('library_change', '01890a5d-ac96-774b-bcce-b302099a8060'),
            revision: 6,
            change_type: 'favorite_added',
            favorite_id: favoriteId,
            target: normalizedTarget,
            changed_at: changedAt,
          },
        ],
      })
    ).not.toThrow();
  });
});
