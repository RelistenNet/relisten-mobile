import {
  AnonymousFavoriteImport,
  AnonymousFavoriteImportState,
  FavoriteMetadataStatus,
  FavoriteMutation,
  UserFavorite,
} from '@/relisten/realm/models/library';
import {
  FavoriteAccountScopeCapture,
  FavoriteRepository,
  FavoriteTarget,
  StaleFavoriteAccountScopeError,
  write,
} from '@/relisten/library/favorite_repository';
import {
  FavoriteLibraryChanges,
  FavoriteLibrarySnapshot,
  FavoriteMutationBatchRequest,
  FavoriteMutationBatchResponse,
  FavoriteSnapshotItem,
  parseFavoriteServerDate,
  validateFavoriteChanges,
  validateFavoriteMutationResponse,
  validateFavoriteSnapshot,
} from '@/relisten/library/favorite_sync_contract';

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
        const mutation = realm.objectForPrimaryKey(FavoriteMutation, result.mutation_uuid);
        if (!mutation || mutation.scopeId !== capture.scopeId) {
          throw new Error('A favorite mutation disappeared before its receipt was applied.');
        }

        const favorite = this.canonicalizeFavorite(
          capture.scopeId,
          mutation,
          result.canonical_favorite_uuid ?? mutation.favoriteUuid,
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
            'scopeId == $0 AND catalogType == $1 AND catalogUuid == $2 AND localSequence <= $3',
            capture.scopeId,
            mutation.catalogType,
            mutation.catalogUuid,
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

        syncState.highestObservedLibraryRevision = Math.max(
          syncState.highestObservedLibraryRevision,
          result.library_revision
        );
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
        const favorite = this.canonicalizeSnapshotItem(capture.scopeId, item, now);
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
        const target: FavoriteTarget = {
          catalogType: change.catalog_type,
          catalogUuid: change.catalog_uuid,
        };
        const favorite = this.ensureCanonicalFavorite(
          capture.scopeId,
          target,
          change.favorite_uuid,
          this.repository.favoriteForTarget(capture.scopeId, target),
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
        page.library_revision,
        ...orderedChanges.map((change) => change.revision)
      );
      syncState.lastSuccessfulSyncAt = now;
      syncState.updatedAt = now;
    });
  }

  private canonicalizeSnapshotItem(scopeId: string, item: FavoriteSnapshotItem, now: Date) {
    const target = { catalogType: item.catalog_type, catalogUuid: item.catalog_uuid };
    return this.ensureCanonicalFavorite(
      scopeId,
      target,
      item.favorite_uuid,
      this.repository.favoriteForTarget(scopeId, target),
      now
    );
  }

  private canonicalizeFavorite(
    scopeId: string,
    mutation: FavoriteMutation,
    canonicalFavoriteUuid: string,
    now: Date
  ) {
    return this.ensureCanonicalFavorite(
      scopeId,
      { catalogType: mutation.catalogType, catalogUuid: mutation.catalogUuid },
      canonicalFavoriteUuid,
      this.repository.favoriteForTarget(scopeId, mutation),
      now
    );
  }

  private ensureCanonicalFavorite(
    scopeId: string,
    target: FavoriteTarget,
    canonicalFavoriteUuid: string,
    naturalFavorite: UserFavorite | undefined,
    now: Date
  ) {
    const realm = this.repository.realm;
    let canonical = realm.objectForPrimaryKey(UserFavorite, canonicalFavoriteUuid) ?? undefined;

    if (canonical && canonical.scopeId !== scopeId) {
      throw new Error('A canonical favorite UUID belongs to another account scope.');
    }

    if (!canonical) {
      canonical = realm.create(UserFavorite, {
        favoriteUuid: canonicalFavoriteUuid,
        scopeId,
        catalogType: target.catalogType,
        catalogUuid: target.catalogUuid,
        acknowledgedPresent: naturalFavorite?.acknowledgedPresent ?? false,
        effectivePresent: naturalFavorite?.effectivePresent ?? false,
        acknowledgedRevision: naturalFavorite?.acknowledgedRevision,
        lastLocalSequence: naturalFavorite?.lastLocalSequence ?? 0,
        metadataStatus: naturalFavorite?.metadataStatus ?? FavoriteMetadataStatus.Unknown,
        serverCreatedAt: naturalFavorite?.serverCreatedAt,
        serverUpdatedAt: naturalFavorite?.serverUpdatedAt,
        createdAt: naturalFavorite?.createdAt ?? now,
        updatedAt: now,
      });
    }

    if (
      canonical.catalogType !== target.catalogType ||
      canonical.catalogUuid !== target.catalogUuid
    ) {
      throw new Error('A canonical favorite UUID was returned for a different catalog target.');
    }

    if (naturalFavorite && naturalFavorite.favoriteUuid !== canonical.favoriteUuid) {
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
          .filtered('scopeId == $0 AND favoriteUuid == $1', scopeId, naturalFavorite.favoriteUuid),
      ];
      for (const mutation of losingReferences) {
        mutation.favoriteUuid = canonical.favoriteUuid;
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
