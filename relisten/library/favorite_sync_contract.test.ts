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

  it('accepts playlist summaries and skips change types it does not know', () => {
    const changeId = (n: number) =>
      formatUuidTypedId('library_change', `01890a5d-ac96-774b-bcce-b302099a80${70 + n}`);
    expect(() =>
      validateFavoriteChanges({
        contract_version: 1,
        library_revision: 9,
        next_cursor: 'opaque-next',
        has_more: false,
        history_generation: 'generation-1',
        changes: [
          {
            change_id: changeId(1),
            revision: 8,
            change_type: 'playlist_summary',
            playlist: {
              playlist_id: formatUuidTypedId('playlist', '01890a5d-ac96-774b-bcce-b302099a8090'),
              name: 'Cornell + friends',
              entry_count: 3,
              archived: false,
              revision: 4,
              updated_at: '2026-11-17T08:00:00Z',
            },
            changed_at: '2026-11-17T08:00:00Z',
          },
          {
            change_id: changeId(2),
            revision: 9,
            change_type: 'playlist_removed',
            changed_at: '2026-11-17T08:00:00Z',
          },
        ],
      })
    ).not.toThrow();
  });

  it('accepts follow changes with heads, and refuses a malformed head', () => {
    const followedId = formatUuidTypedId('playlist', '01890a5d-ac96-774b-bcce-b302099a8091');
    const page = (head: unknown) => ({
      contract_version: 1 as const,
      library_revision: 4,
      next_cursor: 'opaque-next',
      has_more: false,
      changes: [
        {
          change_id: formatUuidTypedId('library_change', '01890a5d-ac96-774b-bcce-b302099a8081'),
          revision: 4,
          change_type: 'playlist_followed',
          followed_playlist_id: followedId,
          changed_at: '2026-11-19T08:00:00Z',
        },
      ],
      followed_playlists: [head] as never,
    });

    expect(() =>
      validateFavoriteChanges(page({ playlist_id: followedId, available: false }))
    ).not.toThrow();
    expect(() =>
      validateFavoriteChanges(page({ playlist_id: followedId, available: true, name: 'No code' }))
    ).toThrow('invalid followed playlist');
  });
});
