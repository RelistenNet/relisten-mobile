import type { FavoriteCatalogType } from '@/relisten/realm/models/library';
import { isPostgresUuid } from '@/relisten/util/postgres_uuid';
import { isUuidV7 } from '@/relisten/util/uuid_v7';

export type FavoriteDesiredState = 'favorite' | 'not_favorite';

export type FavoriteMutationRequestItem =
  | {
      mutation_uuid: string;
      catalog_type: FavoriteCatalogType;
      catalog_uuid: string;
      desired_state: 'favorite';
      favorite_uuid: string;
    }
  | {
      mutation_uuid: string;
      catalog_type: FavoriteCatalogType;
      catalog_uuid: string;
      desired_state: 'not_favorite';
    };

export interface FavoriteMutationBatchRequest {
  contract_version: 1;
  mutations: FavoriteMutationRequestItem[];
}

export interface FavoriteMutationResult {
  mutation_uuid: string;
  catalog_type: FavoriteCatalogType;
  catalog_uuid: string;
  desired_state: FavoriteDesiredState;
  changed: boolean;
  submitted_favorite_uuid: string | null;
  canonical_favorite_uuid: string | null;
  library_revision: number;
}

export interface FavoriteMutationBatchResponse {
  contract_version: 1;
  library_revision: number;
  results: FavoriteMutationResult[];
}

export interface FavoriteSnapshotItem {
  favorite_uuid: string;
  catalog_type: FavoriteCatalogType;
  catalog_uuid: string;
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
  change_uuid: string;
  revision: number;
  change_type: 'favorite_added' | 'favorite_removed';
  favorite_uuid: string;
  catalog_type: FavoriteCatalogType;
  catalog_uuid: string;
  changed_at: string;
}

export interface FavoriteLibraryChanges {
  contract_version: 1;
  library_revision: number;
  changes: FavoriteLibraryChange[];
  next_cursor: string;
  has_more: boolean;
}

const CATALOG_TYPES = new Set<FavoriteCatalogType>([
  'artist',
  'show',
  'source',
  'source_track',
  'song',
  'tour',
  'venue',
]);

/**
 * Network responses are untrusted even though the request client is generic.
 * These checks protect the durable outbox from accepting a partial receipt or
 * applying a server row to a different catalog target.
 */
export function validateFavoriteMutationResponse(
  request: FavoriteMutationBatchRequest,
  response: FavoriteMutationBatchResponse
) {
  assertContractVersion(response.contract_version);
  assertRevision(response.library_revision);

  if (response.results.length !== request.mutations.length) {
    throw new Error('The favorite response does not contain one receipt per mutation.');
  }

  const expected = new Map(
    request.mutations.map((mutation) => {
      assertUserDataUuid(mutation.mutation_uuid);
      if (mutation.desired_state === 'favorite') {
        assertUserDataUuid(mutation.favorite_uuid);
      }
      return [mutation.mutation_uuid, mutation];
    })
  );
  const seen = new Set<string>();

  for (const result of response.results) {
    const mutation = expected.get(result.mutation_uuid);
    if (!mutation || seen.has(result.mutation_uuid)) {
      throw new Error('The favorite response contains an unknown or duplicate mutation UUID.');
    }
    seen.add(result.mutation_uuid);
    assertCatalogTarget(result.catalog_type, result.catalog_uuid);
    assertRevision(result.library_revision);
    if (typeof result.changed !== 'boolean') {
      throw new Error('The favorite response contains an invalid changed value.');
    }
    if (result.submitted_favorite_uuid !== null) {
      assertUserDataUuid(result.submitted_favorite_uuid);
    }
    if (result.canonical_favorite_uuid !== null) {
      assertUserDataUuid(result.canonical_favorite_uuid);
    }

    if (
      mutation.catalog_type !== result.catalog_type ||
      mutation.catalog_uuid !== result.catalog_uuid ||
      mutation.desired_state !== result.desired_state
    ) {
      throw new Error('The favorite response does not match its submitted mutation.');
    }
    if (
      mutation.desired_state === 'favorite' &&
      (result.submitted_favorite_uuid !== mutation.favorite_uuid || !result.canonical_favorite_uuid)
    ) {
      throw new Error('A favorite receipt is missing its submitted or canonical favorite UUID.');
    }
    if (mutation.desired_state === 'not_favorite' && result.submitted_favorite_uuid !== null) {
      throw new Error('A favorite removal receipt contains a submitted favorite UUID.');
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

  const targets = new Set<string>();
  const favoriteUuids = new Set<string>();
  for (const item of snapshot.favorites) {
    assertCatalogTarget(item.catalog_type, item.catalog_uuid);
    assertUserDataUuid(item.favorite_uuid);
    parseFavoriteServerDate(item.created_at);
    parseFavoriteServerDate(item.updated_at);
    const key = favoriteTargetKey(item.catalog_type, item.catalog_uuid);
    if (targets.has(key) || favoriteUuids.has(item.favorite_uuid)) {
      throw new Error('The favorite snapshot contains duplicate membership.');
    }
    targets.add(key);
    favoriteUuids.add(item.favorite_uuid);
  }
}

export function validateFavoriteChanges(page: FavoriteLibraryChanges) {
  assertContractVersion(page.contract_version);
  assertRevision(page.library_revision);
  assertCursor(page.next_cursor);
  if (typeof page.has_more !== 'boolean') {
    throw new Error('The favorite changes page contains an invalid has_more value.');
  }

  const changeUuids = new Set<string>();
  const revisions = new Set<number>();
  for (const change of page.changes) {
    assertCatalogTarget(change.catalog_type, change.catalog_uuid);
    assertUserDataUuid(change.change_uuid);
    assertUserDataUuid(change.favorite_uuid);
    assertRevision(change.revision);
    parseFavoriteServerDate(change.changed_at);
    if (change.change_type !== 'favorite_added' && change.change_type !== 'favorite_removed') {
      throw new Error('The favorite changes page contains an invalid change type.');
    }
    if (change.revision > page.library_revision) {
      throw new Error('A favorite change revision exceeds the page revision.');
    }
    if (changeUuids.has(change.change_uuid) || revisions.has(change.revision)) {
      throw new Error('The favorite changes page contains duplicate changes.');
    }
    changeUuids.add(change.change_uuid);
    revisions.add(change.revision);
  }
}

export function favoriteTargetKey(catalogType: FavoriteCatalogType, catalogUuid: string) {
  return `${catalogType}:${catalogUuid}`;
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

function assertCatalogTarget(catalogType: FavoriteCatalogType, catalogUuid: string) {
  if (!CATALOG_TYPES.has(catalogType) || !isPostgresUuid(catalogUuid)) {
    throw new Error('The favorite response contains an invalid catalog target.');
  }
}

function assertUserDataUuid(value: unknown) {
  if (!isUuidV7(value)) {
    throw new Error('The favorite response contains an invalid UUIDv7 identity.');
  }
}
