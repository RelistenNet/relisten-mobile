import {
  FavoriteTarget,
  favoriteTargetKey,
  isFavoriteTarget,
} from '@/relisten/library/favorite_catalog_target';
import type { PlaylistSummary } from '@/relisten/playlists/sync/playlist_wire';
import {
  type FollowedPlaylistHead,
  isFollowedPlaylistHead,
} from '@/relisten/playlists/sharing/sharing_wire';
import { isUuidV7TypedId } from '@/relisten/util/typed_uuid_id';
import { isFavoriteTargetKind } from '@/relisten/realm/models/library/favorite_catalog_type';

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

/**
 * The library feed carries favorites and, additively, playlist summaries and
 * followed playlists. Both responses also carry the server's history generation.
 */
export interface FavoriteLibrarySnapshot {
  contract_version: 1;
  library_revision: number;
  next_cursor: string;
  favorites: FavoriteSnapshotItem[];
  playlists?: PlaylistSummary[];
  /**
   * Every follow, so this is the whole follow list. The server always sends
   * it; when it is absent the stored follows are left as they are.
   */
  followed_playlists?: FollowedPlaylistHead[];
  history_generation?: string;
}

export interface FavoriteLibraryChange {
  change_id: string;
  revision: number;
  change_type: 'favorite_added' | 'favorite_removed';
  favorite_id: string;
  target: FavoriteTarget;
  changed_at: string;
}

export interface PlaylistSummaryChange {
  change_id: string;
  revision: number;
  change_type: 'playlist_summary';
  playlist: PlaylistSummary;
  changed_at: string;
}

export interface PlaylistFollowChange {
  change_id: string;
  revision: number;
  change_type: 'playlist_followed' | 'playlist_unfollowed';
  followed_playlist_id: string;
  changed_at: string;
}

/** Change types this client does not know are skipped, never rejected. */
export interface UnknownLibraryChange {
  change_id: string;
  revision: number;
  change_type: string;
  changed_at: string;
}

export type LibraryChange =
  | FavoriteLibraryChange
  | PlaylistSummaryChange
  | PlaylistFollowChange
  | UnknownLibraryChange;

export interface FavoriteLibraryChanges {
  contract_version: 1;
  library_revision: number;
  changes: LibraryChange[];
  next_cursor: string;
  has_more: boolean;
  /** Present on the last page of a pull: heads for every follow, without changing membership. */
  followed_playlists?: FollowedPlaylistHead[];
  history_generation?: string;
}

export function isFavoriteChange(change: LibraryChange): change is FavoriteLibraryChange {
  return change.change_type === 'favorite_added' || change.change_type === 'favorite_removed';
}

export function isPlaylistSummaryChange(change: LibraryChange): change is PlaylistSummaryChange {
  return change.change_type === 'playlist_summary';
}

/**
 * A well-formed target of a kind this version of the app doesn't know, such as
 * one added by a later server. It is skipped rather than rejected, so a new
 * kind never stops the rest of the library from syncing. A malformed target of
 * a known kind is still an error.
 */
export function isUnknownFavoriteKind(target: unknown): boolean {
  const candidate = target as { kind?: unknown; id?: unknown } | null;
  return (
    typeof candidate?.kind === 'string' &&
    typeof candidate.id === 'string' &&
    !isFavoriteTargetKind(candidate.kind)
  );
}

export function isPlaylistFollowChange(change: LibraryChange): change is PlaylistFollowChange {
  return change.change_type === 'playlist_followed' || change.change_type === 'playlist_unfollowed';
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

  for (const summary of snapshot.playlists ?? []) {
    assertPlaylistSummary(summary);
  }
  assertFollowedHeads(snapshot.followed_playlists);

  const targets = new Set<string>();
  const favoriteIds = new Set<string>();
  for (const item of snapshot.favorites) {
    if (isUnknownFavoriteKind(item.target)) {
      continue;
    }
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
    assertAccountId(change.change_id, 'library_change');
    assertRevision(change.revision);
    parseFavoriteServerDate(change.changed_at);
    if (isFavoriteChange(change)) {
      if (!isUnknownFavoriteKind(change.target)) {
        assertTarget(change.target);
        assertAccountId(change.favorite_id, 'favorite');
      }
    } else if (isPlaylistSummaryChange(change)) {
      assertPlaylistSummary(change.playlist);
    } else if (
      isPlaylistFollowChange(change) &&
      !isUuidV7TypedId(change.followed_playlist_id, 'playlist')
    ) {
      throw new Error('The library feed contains an invalid follow change.');
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
  assertFollowedHeads(page.followed_playlists);
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

function assertPlaylistSummary(summary: PlaylistSummary) {
  if (
    !isUuidV7TypedId(summary?.playlist_id, 'playlist') ||
    typeof summary.name !== 'string' ||
    !Number.isSafeInteger(summary.entry_count) ||
    typeof summary.archived !== 'boolean' ||
    !Number.isSafeInteger(summary.revision)
  ) {
    throw new Error('The library feed contains an invalid playlist summary.');
  }
  parseFavoriteServerDate(summary.updated_at);
}

function assertFollowedHeads(heads: unknown) {
  if (heads === undefined) {
    return;
  }
  if (!Array.isArray(heads) || !heads.every(isFollowedPlaylistHead)) {
    throw new Error('The library feed contains an invalid followed playlist.');
  }
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
