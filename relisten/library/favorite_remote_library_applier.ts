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
  parseFavoriteServerDate,
  validateFavoriteChanges,
  validateFavoriteMutationResponse,
  validateFavoriteSnapshot,
} from '@/relisten/library/favorite_sync_contract';
import { isTrulyUnsentFavoriteMutation } from '@/relisten/library/favorite_mutation_compaction';

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
      const scopedFavorites = realm
        .objects(UserFavorite)
        .filtered('scopeId == $0', capture.scopeId);

      for (const favorite of scopedFavorites) {
        if ((favorite.acknowledgedRevision ?? -1) <= snapshot.library_revision) {
          favorite.acknowledgedPresent = false;
          favorite.acknowledgedRevision = snapshot.library_revision;
        }
      }

      for (const item of snapshot.favorites) {
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

      const syncState = this.repository.syncState(capture.scopeId, now);
      syncState.libraryCursor = snapshot.next_cursor;
      syncState.highestObservedLibraryRevision = Math.max(
        syncState.highestObservedLibraryRevision,
        snapshot.library_revision
      );
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
    const orderedChanges = [...page.changes].sort((left, right) => left.revision - right.revision);

    write(realm, () => {
      this.assertCurrent(capture);

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
