import {
  AnonymousFavoriteImport,
  AnonymousFavoriteImportState,
  FavoriteMutation,
  UserFavorite,
} from '@/relisten/realm/models/library';
import {
  FavoriteAccountScopeCapture,
  FavoriteRepository,
  StaleFavoriteAccountScopeError,
  write,
} from '@/relisten/library/favorite_repository';
import type { FavoriteTarget } from '@/relisten/library/favorite_catalog_target';
import {
  FavoriteLibraryChanges,
  FavoriteLibrarySnapshot,
  FavoriteMutationBatchRequest,
  FavoriteMutationBatchResponse,
  isFavoriteChange,
  isPlaylistFollowChange,
  isPlaylistSummaryChange,
  parseFavoriteServerDate,
  isUnknownFavoriteKind,
  validateFavoriteChanges,
  validateFavoriteMutationResponse,
  validateFavoriteSnapshot,
} from '@/relisten/library/favorite_sync_contract';
import { isTrulyUnsentFavoriteMutation } from '@/relisten/library/favorite_mutation_compaction';
import {
  applyPlaylistSummaries,
  startRestoreRecovery,
} from '@/relisten/playlists/sync/playlist_sync_state';
import type { PlaylistSummary } from '@/relisten/playlists/sync/playlist_wire';
import {
  applyFollowChanges,
  applyFollowedHeads,
  replaceFollows,
} from '@/relisten/playlists/sharing/followed_playlists';

/** Applies validated server state while preserving newer local desired state. */
export class FavoriteRemoteLibraryApplier {
  constructor(private readonly repository: FavoriteRepository) {}

  applyMutationResponse(
    capture: FavoriteAccountScopeCapture,
    request: FavoriteMutationBatchRequest,
    response: FavoriteMutationBatchResponse,
    now = new Date()
  ) {
    this.assertCurrent(capture);
    validateFavoriteMutationResponse(request, response);
    const realm = this.repository.realm;

    write(realm, () => {
      this.assertCurrent(capture);
      const syncState = this.repository.syncState(capture.scopeId, now);

      for (const result of response.results) {
        const mutation = realm.objectForPrimaryKey(FavoriteMutation, result.mutation_id);
        if (!mutation || mutation.scopeId !== capture.scopeId) {
          throw new Error('A favorite mutation disappeared before its receipt was applied.');
        }

        const favorite = this.ensureCanonicalFavorite(
          capture.scopeId,
          { kind: mutation.targetKind, id: mutation.targetId },
          result.canonical_favorite_id ?? mutation.favoriteId,
          now
        );

        if ((favorite.acknowledgedRevision ?? -1) <= result.library_revision) {
          favorite.acknowledgedPresent = result.desired_state === 'favorite';
          favorite.acknowledgedRevision = result.library_revision;
          favorite.updatedAt = now;
        }

        const completedSequence = mutation.localSequence;
        const superseded = realm
          .objects(FavoriteMutation)
          .filtered(
            'scopeId == $0 AND targetKind == $1 AND targetId == $2 AND localSequence <= $3',
            capture.scopeId,
            mutation.targetKind,
            mutation.targetId,
            completedSequence
          );
        const importUuids = new Set(
          superseded.map((operation) => operation.importUuid).filter(isDefined)
        );
        realm.delete(superseded);
        this.repository.recomputeEffectiveFavorite(favorite, now);
        for (const importUuid of importUuids) {
          this.completeImportWhenSettled(importUuid, now);
        }
      }

      syncState.highestObservedLibraryRevision = Math.max(
        syncState.highestObservedLibraryRevision,
        response.library_revision
      );
      syncState.lastSuccessfulSyncAt = now;
      syncState.updatedAt = now;
    });
  }

  applySnapshot(
    capture: FavoriteAccountScopeCapture,
    snapshot: FavoriteLibrarySnapshot,
    now = new Date()
  ) {
    this.assertCurrent(capture);
    validateFavoriteSnapshot(snapshot);
    const realm = this.repository.realm;

    write(realm, () => {
      this.assertCurrent(capture);
      const restored = this.resetIfRestored(capture, snapshot.history_generation, now);
      const scopedFavorites = realm
        .objects(UserFavorite)
        .filtered('scopeId == $0', capture.scopeId);

      for (const favorite of scopedFavorites) {
        if ((favorite.acknowledgedRevision ?? -1) <= snapshot.library_revision) {
          favorite.acknowledgedPresent = false;
          favorite.acknowledgedRevision = snapshot.library_revision;
        }
      }

      for (const item of snapshot.favorites.filter((i) => !isUnknownFavoriteKind(i.target))) {
        const favorite = this.ensureCanonicalFavorite(
          capture.scopeId,
          item.target,
          item.favorite_id,
          now
        );
        if ((favorite.acknowledgedRevision ?? -1) <= snapshot.library_revision) {
          favorite.acknowledgedPresent = true;
          favorite.acknowledgedRevision = snapshot.library_revision;
          favorite.serverCreatedAt = parseFavoriteServerDate(item.created_at);
          favorite.serverUpdatedAt = parseFavoriteServerDate(item.updated_at);
        }
      }

      for (const favorite of realm
        .objects(UserFavorite)
        .filtered('scopeId == $0', capture.scopeId)) {
        this.repository.recomputeEffectiveFavorite(favorite, now);
      }

      this.applyPlaylistFeed(capture, snapshot.playlists ?? []);
      // The list is the whole set of follows, so anything missing from it is
      // removed. A snapshot without the field says nothing about follows and
      // must not be read as "none".
      const heads = snapshot.followed_playlists;
      if (capture.userId && heads) {
        replaceFollows(
          realm,
          capture.userId,
          heads.map((head) => head.playlist_id)
        );
        applyFollowedHeads(realm, capture.userId, heads);
      }

      const syncState = this.repository.syncState(capture.scopeId, now);
      syncState.libraryCursor = snapshot.next_cursor;
      syncState.highestObservedLibraryRevision = restored
        ? snapshot.library_revision
        : Math.max(syncState.highestObservedLibraryRevision, snapshot.library_revision);
      syncState.lastSuccessfulSyncAt = now;
      syncState.updatedAt = now;
    });
  }

  applyChanges(
    capture: FavoriteAccountScopeCapture,
    page: FavoriteLibraryChanges,
    now = new Date()
  ) {
    this.assertCurrent(capture);
    validateFavoriteChanges(page);
    const realm = this.repository.realm;
    const ordered = [...page.changes].sort((left, right) => left.revision - right.revision);
    const orderedChanges = ordered
      .filter(isFavoriteChange)
      .filter((change) => !isUnknownFavoriteKind(change.target));
    const playlistSummaries = ordered.filter(isPlaylistSummaryChange).map((c) => c.playlist);
    const followChanges = ordered.filter(isPlaylistFollowChange).map((change) => ({
      playlistId: change.followed_playlist_id,
      followed: change.change_type === 'playlist_followed',
    }));

    write(realm, () => {
      this.assertCurrent(capture);
      if (this.resetIfRestored(capture, page.history_generation, now)) {
        return;
      }

      for (const change of orderedChanges) {
        const target = change.target;
        const favorite = this.ensureCanonicalFavorite(
          capture.scopeId,
          target,
          change.favorite_id,
          now
        );

        if ((favorite.acknowledgedRevision ?? -1) <= change.revision) {
          favorite.acknowledgedPresent = change.change_type === 'favorite_added';
          favorite.acknowledgedRevision = change.revision;
          favorite.serverUpdatedAt = parseFavoriteServerDate(change.changed_at);
        }
        this.repository.recomputeEffectiveFavorite(favorite, now);
      }

      this.applyPlaylistFeed(capture, playlistSummaries);
      if (capture.userId) {
        applyFollowChanges(realm, capture.userId, followChanges);
        applyFollowedHeads(realm, capture.userId, page.followed_playlists ?? []);
      }

      const syncState = this.repository.syncState(capture.scopeId, now);
      syncState.libraryCursor = page.next_cursor;
      syncState.highestObservedLibraryRevision = Math.max(
        syncState.highestObservedLibraryRevision,
        page.library_revision
      );
      syncState.lastSuccessfulSyncAt = now;
      syncState.updatedAt = now;
    });
  }

  /**
   * A new history generation means the server was restored, possibly to an
   * earlier revision. Revisions from before the restore no longer compare, so
   * the confirmed favorites base and cursor are forgotten; the snapshot that
   * follows becomes the base, and pending local intent is reapplied over it.
   * Playlist sync recovers in the same write. Returns whether this happened.
   */
  private resetIfRestored(
    capture: FavoriteAccountScopeCapture,
    historyGeneration: string | undefined,
    now: Date
  ): boolean {
    const syncState = this.repository.syncState(capture.scopeId, now);
    if (!historyGeneration) {
      return false;
    }
    const restored =
      !!syncState.historyGeneration && syncState.historyGeneration !== historyGeneration;
    syncState.historyGeneration = historyGeneration;
    if (!restored) {
      return false;
    }

    const realm = this.repository.realm;
    for (const favorite of realm.objects(UserFavorite).filtered('scopeId == $0', capture.scopeId)) {
      favorite.acknowledgedRevision = undefined;
    }
    syncState.libraryCursor = undefined;
    syncState.highestObservedLibraryRevision = 0;
    if (capture.userId) {
      startRestoreRecovery(realm, capture.userId);
    }
    return true;
  }

  /**
   * Hands playlist summaries to playlist sync, in the same write as the cursor.
   * A restore was already handled by `resetIfRestored` before this runs.
   */
  private applyPlaylistFeed(capture: FavoriteAccountScopeCapture, summaries: PlaylistSummary[]) {
    if (capture.userId) {
      applyPlaylistSummaries(this.repository.realm, capture.userId, summaries);
    }
  }

  private ensureCanonicalFavorite(
    scopeId: string,
    target: FavoriteTarget,
    canonicalFavoriteId: string,
    now: Date
  ) {
    const naturalFavorite = this.repository.favoriteForTarget(scopeId, target);
    const realm = this.repository.realm;
    let canonical = realm.objectForPrimaryKey(UserFavorite, canonicalFavoriteId) ?? undefined;

    if (canonical && canonical.scopeId !== scopeId) {
      throw new Error('A canonical favorite ID belongs to another account scope.');
    }

    if (!canonical) {
      canonical = realm.create(UserFavorite, {
        favoriteId: canonicalFavoriteId,
        scopeId,
        targetKind: target.kind,
        targetId: target.id,
        acknowledgedPresent: naturalFavorite?.acknowledgedPresent ?? false,
        effectivePresent: naturalFavorite?.effectivePresent ?? false,
        acknowledgedRevision: naturalFavorite?.acknowledgedRevision,
        lastLocalSequence: naturalFavorite?.lastLocalSequence ?? 0,
        serverCreatedAt: naturalFavorite?.serverCreatedAt,
        serverUpdatedAt: naturalFavorite?.serverUpdatedAt,
        createdAt: naturalFavorite?.createdAt ?? now,
        updatedAt: now,
      });
    }

    if (canonical.targetKind !== target.kind || canonical.targetId !== target.id) {
      throw new Error('A canonical favorite ID was returned for a different catalog target.');
    }

    if (naturalFavorite && naturalFavorite.favoriteId !== canonical.favoriteId) {
      if ((naturalFavorite.acknowledgedRevision ?? -1) > (canonical.acknowledgedRevision ?? -1)) {
        canonical.acknowledgedPresent = naturalFavorite.acknowledgedPresent;
        canonical.acknowledgedRevision = naturalFavorite.acknowledgedRevision;
      }
      canonical.createdAt =
        canonical.createdAt < naturalFavorite.createdAt
          ? canonical.createdAt
          : naturalFavorite.createdAt;
      canonical.serverCreatedAt ??= naturalFavorite.serverCreatedAt;
      canonical.serverUpdatedAt ??= naturalFavorite.serverUpdatedAt;

      const losingReferences = [
        ...realm
          .objects(FavoriteMutation)
          .filtered('scopeId == $0 AND favoriteId == $1', scopeId, naturalFavorite.favoriteId),
      ].filter(isTrulyUnsentFavoriteMutation);
      for (const mutation of losingReferences) {
        mutation.favoriteId = canonical.favoriteId;
      }
      realm.delete(naturalFavorite);
    }

    return canonical;
  }

  private completeImportWhenSettled(importUuid: string, now: Date) {
    const realm = this.repository.realm;
    if (realm.objects(FavoriteMutation).filtered('importUuid == $0', importUuid).length > 0) {
      return;
    }

    const receipt = realm.objectForPrimaryKey(AnonymousFavoriteImport, importUuid);
    if (receipt) {
      receipt.state = AnonymousFavoriteImportState.Completed;
      receipt.completedAt = now;
      receipt.updatedAt = now;
    }
  }

  private assertCurrent(capture: FavoriteAccountScopeCapture) {
    if (!this.repository.isCaptureCurrent(capture)) {
      throw new StaleFavoriteAccountScopeError();
    }
  }
}

function isDefined<T>(value: T | null | undefined): value is T {
  // Realm materializes optional scalar properties as null even when the
  // generated TypeScript surface describes them as undefined.
  return value != null;
}
