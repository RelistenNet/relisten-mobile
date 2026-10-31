import {
  FavoriteTarget,
  favoriteTargetKey,
  isFavoriteTarget,
} from '@/relisten/library/favorite_catalog_target';
import { isUuidV7TypedId } from '@/relisten/util/typed_uuid_id';

export type FavoriteDesiredState = 'favorite' | 'not_favorite';

export type FavoriteMutationRequestItem =
  | {
      mutation_id: string;
      target: FavoriteTarget;
      desired_state: 'favorite';
      favorite_id: string;
    }
  | {
      mutation_id: string;
      target: FavoriteTarget;
      desired_state: 'not_favorite';
    };

export interface FavoriteMutationBatchRequest {
  contract_version: 1;
  mutations: FavoriteMutationRequestItem[];
}

export interface FavoriteMutationResult {
  mutation_id: string;
  target: FavoriteTarget;
  desired_state: FavoriteDesiredState;
  changed: boolean;
  submitted_favorite_id: string | null;
  canonical_favorite_id: string | null;
  library_revision: number;
}

export interface FavoriteMutationBatchResponse {
  contract_version: 1;
  library_revision: number;
  results: FavoriteMutationResult[];
}

export interface FavoriteSnapshotItem {
  favorite_id: string;
  target: FavoriteTarget;
  created_at: string;
  updated_at: string;
}

export interface FavoriteLibrarySnapshot {
  contract_version: 1;
  library_revision: number;
  next_cursor: string;
  favorites: FavoriteSnapshotItem[];
}

export interface FavoriteLibraryChange {
  change_id: string;
  revision: number;
  change_type: 'favorite_added' | 'favorite_removed';
  favorite_id: string;
  target: FavoriteTarget;
  changed_at: string;
}

export interface FavoriteLibraryChanges {
  contract_version: 1;
  library_revision: number;
  changes: FavoriteLibraryChange[];
  next_cursor: string;
  has_more: boolean;
}

/**
 * Network responses are untrusted even though the request client is generic.
 * These checks protect the durable outbox from accepting a partial receipt or
 * applying a server row to a different exact target.
 */
export function validateFavoriteMutationResponse(
  request: FavoriteMutationBatchRequest,
  response: FavoriteMutationBatchResponse
) {
  assertContractVersion(response.contract_version);
  assertRevision(response.library_revision);

  if (!Array.isArray(response.results) || response.results.length !== request.mutations.length) {
    throw new Error('The favorite response does not contain one receipt per mutation.');
  }

  const expected = new Map(
    request.mutations.map((mutation) => {
      assertAccountId(mutation.mutation_id, 'mutation');
      assertTarget(mutation.target);
      if (mutation.desired_state === 'favorite') {
        assertAccountId(mutation.favorite_id, 'favorite');
      }
      return [mutation.mutation_id, mutation];
    })
  );
  const seen = new Set<string>();

  for (const result of response.results) {
    const mutation = expected.get(result.mutation_id);
    if (!mutation || seen.has(result.mutation_id)) {
      throw new Error('The favorite response contains an unknown or duplicate mutation ID.');
    }
    seen.add(result.mutation_id);
    assertTarget(result.target);
    assertRevision(result.library_revision);
    if (typeof result.changed !== 'boolean') {
      throw new Error('The favorite response contains an invalid changed value.');
    }
    if (result.submitted_favorite_id !== null) {
      assertAccountId(result.submitted_favorite_id, 'favorite');
    }
    if (result.canonical_favorite_id !== null) {
      assertAccountId(result.canonical_favorite_id, 'favorite');
    }

    if (
      favoriteTargetKey(mutation.target) !== favoriteTargetKey(result.target) ||
      mutation.desired_state !== result.desired_state
    ) {
      throw new Error('The favorite response does not match its submitted mutation.');
    }
    if (
      mutation.desired_state === 'favorite' &&
      (result.submitted_favorite_id !== mutation.favorite_id || !result.canonical_favorite_id)
    ) {
      throw new Error('A favorite receipt is missing its submitted or canonical favorite ID.');
    }
    if (mutation.desired_state === 'not_favorite' && result.submitted_favorite_id !== null) {
      throw new Error('A favorite removal receipt contains a submitted favorite ID.');
    }
    if (result.library_revision > response.library_revision) {
      throw new Error('A favorite receipt revision exceeds the response revision.');
    }
  }
}

export function validateFavoriteSnapshot(snapshot: FavoriteLibrarySnapshot) {
  assertContractVersion(snapshot.contract_version);
  assertRevision(snapshot.library_revision);
  assertCursor(snapshot.next_cursor);
  if (!Array.isArray(snapshot.favorites)) {
    throw new Error('The favorite snapshot is missing its memberships.');
  }

  const targets = new Set<string>();
  const favoriteIds = new Set<string>();
  for (const item of snapshot.favorites) {
    assertTarget(item.target);
    assertAccountId(item.favorite_id, 'favorite');
    parseFavoriteServerDate(item.created_at);
    parseFavoriteServerDate(item.updated_at);
    const key = favoriteTargetKey(item.target);
    if (targets.has(key) || favoriteIds.has(item.favorite_id)) {
      throw new Error('The favorite snapshot contains duplicate membership.');
    }
    targets.add(key);
    favoriteIds.add(item.favorite_id);
  }
}

export function validateFavoriteChanges(page: FavoriteLibraryChanges) {
  assertContractVersion(page.contract_version);
  assertRevision(page.library_revision);
  assertCursor(page.next_cursor);
  if (!Array.isArray(page.changes)) {
    throw new Error('The favorite changes page is missing its changes.');
  }
  if (typeof page.has_more !== 'boolean') {
    throw new Error('The favorite changes page contains an invalid has_more value.');
  }

  const changeIds = new Set<string>();
  const revisions = new Set<number>();
  for (const change of page.changes) {
    assertTarget(change.target);
    assertAccountId(change.change_id, 'library_change');
    assertAccountId(change.favorite_id, 'favorite');
    assertRevision(change.revision);
    parseFavoriteServerDate(change.changed_at);
    if (change.change_type !== 'favorite_added' && change.change_type !== 'favorite_removed') {
      throw new Error('The favorite changes page contains an invalid change type.');
    }
    if (change.revision > page.library_revision) {
      throw new Error('A favorite change revision exceeds the page revision.');
    }
    if (changeIds.has(change.change_id) || revisions.has(change.revision)) {
      throw new Error('The favorite changes page contains duplicate changes.');
    }
    changeIds.add(change.change_id);
    revisions.add(change.revision);
  }
}

export function parseFavoriteServerDate(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('The favorite response contains an invalid timestamp.');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error('The favorite response contains an invalid timestamp.');
  }
  return parsed;
}

function assertContractVersion(version: number) {
  if (version !== 1) {
    throw new Error(`Unsupported favorite response contract ${version}.`);
  }
}

function assertRevision(revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('The favorite response contains an invalid library revision.');
  }
}

function assertCursor(cursor: string) {
  if (typeof cursor !== 'string' || cursor.length === 0) {
    throw new Error('The favorite response is missing its opaque cursor.');
  }
}

function assertTarget(target: unknown): asserts target is FavoriteTarget {
  if (!isFavoriteTarget(target)) {
    throw new Error('The favorite response contains an invalid catalog target.');
  }
}

function assertAccountId(value: unknown, prefix: 'favorite' | 'library_change' | 'mutation') {
  if (!isUuidV7TypedId(value, prefix)) {
    throw new Error(`The favorite response contains an invalid ${prefix} ID.`);
  }
}
