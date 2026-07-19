import Realm from 'realm';
import { ANONYMOUS_ACCOUNT_SCOPE_ID } from '@/relisten/realm/models/accounts';
import {
  AnonymousFavoriteImport,
  AnonymousFavoriteImportState,
  FavoriteCatalogType,
  FavoriteMetadataStatus,
  FavoriteMutation,
  FavoriteMutationState,
  FavoriteSyncState,
  UserFavorite,
} from '@/relisten/realm/models/library';
import { createUuidV7 } from '@/relisten/util/uuid_v7';
import {
  importUuidsSettledByCompaction,
  isTrulyUnsentFavoriteMutation,
} from './favorite_mutation_compaction';

export interface FavoriteAccountScopeCapture {
  scopeId: string;
  generation: number;
}

export interface FavoriteAccountScopeSource {
  subscribe(listener: () => void): () => void;
  capture(): FavoriteAccountScopeCapture;
  isCurrent(capture: FavoriteAccountScopeCapture): boolean;
}

export interface FavoriteTarget {
  catalogType: FavoriteCatalogType;
  catalogUuid: string;
}

export interface DesiredFavoriteChange extends FavoriteTarget {
  isFavorite: boolean;
}

export interface SetFavoriteOptions {
  capture?: FavoriteAccountScopeCapture;
  importUuid?: string;
  now?: Date;
}

export interface SetFavoritesResult {
  changed: boolean;
  mutationUuids: string[];
}

const LEGACY_MODEL_BY_CATALOG_TYPE: Record<FavoriteCatalogType, string> = {
  artist: 'Artist',
  show: 'Show',
  source: 'Source',
  source_track: 'SourceTrack',
  song: 'Song',
  tour: 'Tour',
  venue: 'Venue',
};

export class StaleFavoriteAccountScopeError extends Error {
  constructor() {
    super('The active account changed before the favorite write completed.');
    this.name = 'StaleFavoriteAccountScopeError';
  }
}

/**
 * Owns the local membership and its ordered outbox. UI code should express a
 * desired state through this class instead of toggling a catalog model flag.
 */
export class FavoriteRepository {
  constructor(
    public readonly realm: Realm,
    private readonly accountScopeSource: FavoriteAccountScopeSource
  ) {}

  captureScope() {
    return this.accountScopeSource.capture();
  }

  isCaptureCurrent(capture: FavoriteAccountScopeCapture) {
    return this.accountScopeSource.isCurrent(capture);
  }

  activeScopeId() {
    return this.captureScope().scopeId;
  }

  isFavorite(target: FavoriteTarget, scopeId = this.activeScopeId()) {
    return this.favoriteForTarget(scopeId, target)?.effectivePresent ?? false;
  }

  favoriteForTarget(scopeId: string, target: FavoriteTarget) {
    return this.realm
      .objects(UserFavorite)
      .filtered(
        'scopeId == $0 AND catalogType == $1 AND catalogUuid == $2',
        scopeId,
        target.catalogType,
        target.catalogUuid
      )[0];
  }

  activeFavorites(scopeId = this.activeScopeId()) {
    return this.realm
      .objects(UserFavorite)
      .filtered('scopeId == $0 AND effectivePresent == true', scopeId);
  }

  setFavorite(change: DesiredFavoriteChange, options: SetFavoriteOptions = {}) {
    return this.setFavorites([change], options);
  }

  setAnonymousFavorites(
    changes: ReadonlyArray<DesiredFavoriteChange>,
    now = new Date()
  ): SetFavoritesResult {
    const normalizedChanges = uniqueChanges(changes);

    return write(this.realm, () => {
      const mutationUuids: string[] = [];
      let changed = false;
      const anonymousCapture = { scopeId: ANONYMOUS_ACCOUNT_SCOPE_ID, generation: 0 };

      for (const change of normalizedChanges) {
        const result = this.setFavoriteWithinWrite(anonymousCapture, change, now);
        changed ||= result.changed;
        if (result.mutationUuid) {
          mutationUuids.push(result.mutationUuid);
        }
      }

      return { changed, mutationUuids };
    });
  }

  setFavorites(
    changes: ReadonlyArray<DesiredFavoriteChange>,
    options: SetFavoriteOptions = {}
  ): SetFavoritesResult {
    const capture = options.capture ?? this.captureScope();
    this.assertCurrent(capture);

    if (changes.length === 0) {
      return { changed: false, mutationUuids: [] };
    }

    const normalizedChanges = uniqueChanges(changes);
    const now = options.now ?? new Date();

    return write(this.realm, () => {
      this.assertCurrent(capture);

      const mutationUuids: string[] = [];
      let changed = false;

      for (const change of normalizedChanges) {
        const result = this.setFavoriteWithinWrite(capture, change, now, options.importUuid);
        changed ||= result.changed;
        if (result.mutationUuid) {
          mutationUuids.push(result.mutationUuid);
        }
      }

      return { changed, mutationUuids };
    });
  }

  resetInterruptedMutations(capture = this.captureScope(), now = new Date()) {
    this.assertCurrent(capture);

    return write(this.realm, () => {
      this.assertCurrent(capture);
      const interrupted = [
        ...this.realm
          .objects(FavoriteMutation)
          .filtered(
            'scopeId == $0 AND state == $1',
            capture.scopeId,
            FavoriteMutationState.InFlight
          ),
      ];

      for (const mutation of interrupted) {
        mutation.state = FavoriteMutationState.Pending;
        mutation.requestStartedAt = undefined;
        mutation.updatedAt = now;
      }

      return interrupted.length;
    });
  }

  retryFailedMutations(capture = this.captureScope(), now = new Date()) {
    this.assertCurrent(capture);

    return write(this.realm, () => {
      this.assertCurrent(capture);
      const failed = [
        ...this.realm
          .objects(FavoriteMutation)
          .filtered(
            'scopeId == $0 AND state == $1 AND lastErrorCode != nil',
            capture.scopeId,
            FavoriteMutationState.Pending
          ),
      ];
      const count = failed.length;

      for (const mutation of failed) {
        mutation.nextAttemptAt = undefined;
        mutation.lastErrorCode = undefined;
        mutation.lastErrorMessage = undefined;
        mutation.updatedAt = now;
      }

      return count;
    });
  }

  discardRejectedMutations(capture = this.captureScope(), now = new Date()) {
    this.assertCurrent(capture);

    return write(this.realm, () => {
      this.assertCurrent(capture);
      const rejected = this.realm
        .objects(FavoriteMutation)
        .filtered(
          'scopeId == $0 AND state == $1',
          capture.scopeId,
          FavoriteMutationState.NeedsAttention
        );
      const affectedTargets = new Map<string, FavoriteTarget>();
      const affectedImports = new Set<string>();
      const count = rejected.length;

      for (const mutation of rejected) {
        affectedTargets.set(targetKey(mutation), mutation);
        if (mutation.importUuid) {
          affectedImports.add(mutation.importUuid);
        }
      }
      this.realm.delete(rejected);

      for (const target of affectedTargets.values()) {
        const favorite = this.favoriteForTarget(capture.scopeId, target);
        if (favorite) {
          this.recomputeEffectiveFavorite(favorite, now);
        }
      }
      for (const importUuid of affectedImports) {
        this.completeImportWhenSettled(importUuid, now);
      }

      return count;
    });
  }

  syncState(scopeId: string, now = new Date()) {
    const existing = this.realm.objects(FavoriteSyncState).filtered('scopeId == $0', scopeId)[0];
    if (existing) {
      return existing;
    }

    return this.realm.create(FavoriteSyncState, {
      syncStateUuid: createUuidV7(),
      scopeId,
      libraryCursor: undefined,
      highestObservedLibraryRevision: 0,
      nextLocalSequence: 1,
      lastSuccessfulSyncAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  recomputeEffectiveFavorite(favorite: UserFavorite, now = new Date()) {
    const newestMutation = this.realm
      .objects(FavoriteMutation)
      .filtered(
        'scopeId == $0 AND catalogType == $1 AND catalogUuid == $2 SORT(localSequence DESC) LIMIT(1)',
        favorite.scopeId,
        favorite.catalogType,
        favorite.catalogUuid
      )[0];

    favorite.effectivePresent = newestMutation?.desiredPresent ?? favorite.acknowledgedPresent;
    favorite.lastLocalSequence = newestMutation?.localSequence ?? 0;
    favorite.updatedAt = now;
  }

  private setFavoriteWithinWrite(
    capture: FavoriteAccountScopeCapture,
    change: DesiredFavoriteChange,
    now: Date,
    importUuid?: string
  ) {
    let favorite = this.favoriteForTarget(capture.scopeId, change);
    const currentValue = favorite?.effectivePresent ?? false;

    if (currentValue === change.isFavorite) {
      return { changed: false };
    }

    if (!favorite && !change.isFavorite) {
      return { changed: false };
    }

    if (!favorite) {
      favorite = this.realm.create(UserFavorite, {
        favoriteUuid: createUuidV7(),
        scopeId: capture.scopeId,
        catalogType: change.catalogType,
        catalogUuid: change.catalogUuid,
        acknowledgedPresent: false,
        effectivePresent: false,
        acknowledgedRevision: undefined,
        lastLocalSequence: 0,
        metadataStatus: this.catalogObjectExists(change)
          ? FavoriteMetadataStatus.Available
          : FavoriteMetadataStatus.Unknown,
        serverCreatedAt: undefined,
        serverUpdatedAt: undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (capture.scopeId === ANONYMOUS_ACCOUNT_SCOPE_ID) {
      favorite.acknowledgedPresent = change.isFavorite;
      favorite.effectivePresent = change.isFavorite;
      favorite.acknowledgedRevision = undefined;
      favorite.lastLocalSequence = 0;
      favorite.updatedAt = now;
      this.updateLegacyCatalogFlag(change);
      return { changed: true };
    }

    const unsent = [
      ...this.realm
        .objects(FavoriteMutation)
        .filtered(
          'scopeId == $0 AND catalogType == $1 AND catalogUuid == $2 AND state == $3',
          capture.scopeId,
          change.catalogType,
          change.catalogUuid,
          FavoriteMutationState.Pending
        ),
    ].filter(isTrulyUnsentFavoriteMutation);
    const affectedImports = importUuidsSettledByCompaction(unsent);
    this.realm.delete(unsent);

    // In-flight and terminal operations keep their immutable operation IDs. A
    // later tap queues behind them, even when unsent taps were compacted away.
    this.recomputeEffectiveFavorite(favorite, now);
    for (const importUuid of affectedImports) {
      this.completeImportWhenSettled(importUuid, now);
    }
    if (favorite.effectivePresent === change.isFavorite) {
      return { changed: true };
    }

    const syncState = this.syncState(capture.scopeId, now);
    const mutationUuid = createUuidV7();
    const localSequence = syncState.nextLocalSequence;
    syncState.nextLocalSequence += 1;
    syncState.updatedAt = now;

    this.realm.create(FavoriteMutation, {
      mutationUuid,
      scopeId: capture.scopeId,
      favoriteUuid: favorite.favoriteUuid,
      catalogType: change.catalogType,
      catalogUuid: change.catalogUuid,
      desiredPresent: change.isFavorite,
      localSequence,
      state: FavoriteMutationState.Pending,
      importUuid,
      attemptCount: 0,
      nextAttemptAt: undefined,
      requestStartedAt: undefined,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      createdAt: now,
      updatedAt: now,
    });

    favorite.effectivePresent = change.isFavorite;
    favorite.lastLocalSequence = localSequence;
    favorite.updatedAt = now;

    return { changed: true, mutationUuid };
  }

  private updateLegacyCatalogFlag(change: DesiredFavoriteChange) {
    const modelName = LEGACY_MODEL_BY_CATALOG_TYPE[change.catalogType];
    if (!this.realm.schema.some((model) => model.name === modelName)) {
      return;
    }

    const catalogObject = this.realm.objectForPrimaryKey(modelName, change.catalogUuid);
    if (catalogObject && 'isFavorite' in catalogObject) {
      catalogObject.isFavorite = change.isFavorite;
    }
  }

  private catalogObjectExists(target: FavoriteTarget) {
    return !!this.realm.objectForPrimaryKey(
      LEGACY_MODEL_BY_CATALOG_TYPE[target.catalogType],
      target.catalogUuid
    );
  }

  private completeImportWhenSettled(importUuid: string, now: Date) {
    const remaining = this.realm.objects(FavoriteMutation).filtered('importUuid == $0', importUuid);
    if (remaining.length > 0) {
      return;
    }

    const receipt = this.realm.objectForPrimaryKey(AnonymousFavoriteImport, importUuid);
    if (receipt) {
      receipt.state = AnonymousFavoriteImportState.Completed;
      receipt.completedAt = now;
      receipt.updatedAt = now;
    }
  }

  private assertCurrent(capture: FavoriteAccountScopeCapture) {
    if (!this.accountScopeSource.isCurrent(capture)) {
      throw new StaleFavoriteAccountScopeError();
    }
  }
}

function uniqueChanges(changes: ReadonlyArray<DesiredFavoriteChange>) {
  const byTarget = new Map<string, DesiredFavoriteChange>();

  for (const change of changes) {
    if (!change.catalogUuid) {
      throw new Error('A favorite catalog UUID is required.');
    }
    byTarget.set(`${change.catalogType}:${change.catalogUuid}`, change);
  }

  return [...byTarget.values()];
}

function targetKey(target: FavoriteTarget) {
  return `${target.catalogType}:${target.catalogUuid}`;
}

export function write<T>(realm: Realm, callback: () => T): T {
  return realm.isInTransaction ? callback() : realm.write(callback);
}
