import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { requireInstallationUuid } from '@/relisten/accounts/auth/installation_id';
import {
  AnonymousFavoriteImport,
  AnonymousFavoriteImportState,
  FavoriteCatalogType,
  FavoriteMetadataStatus,
  FavoriteMutation,
  FavoriteMutationState,
  FavoriteSyncRunStatus,
  FavoriteSyncState,
  UserFavorite,
} from '@/relisten/realm/models/library';
import { ANONYMOUS_ACCOUNT_SCOPE_ID } from '@/relisten/realm/models/accounts';
import { useQuery } from '@/relisten/realm/schema';
import {
  useAnonymousLibraryImportService,
  useFavoriteRepository,
  useFavoriteSyncService,
  useRootLibraryIndex,
} from '@/relisten/realm/root_services';
import { favoriteSyncPresentationState } from '@/relisten/library/favorite_sync_presentation';
import { anonymousFavoriteSourceFingerprint } from '@/relisten/library/anonymous_favorite_import_fingerprint';
import {
  FavoriteSyncStateView,
  favoriteSyncStateSnapshot,
  favoriteSyncStateView,
} from '@/relisten/library/favorite_sync_state_snapshot';

export interface FavoriteState {
  isFavorite: boolean;
  setFavorite(isFavorite: boolean): void;
  toggleFavorite(): void;
}

export function useFavorite(catalogType: FavoriteCatalogType, catalogUuid: string): FavoriteState {
  const repository = useFavoriteRepository();
  const libraryIndex = useRootLibraryIndex();

  const favoriteRevision = useSyncExternalStore(
    (listener) => libraryIndex.subscribeFavorite(catalogType, catalogUuid, listener),
    () => libraryIndex.getFavoriteSnapshot(catalogType, catalogUuid),
    () => libraryIndex.getFavoriteSnapshot(catalogType, catalogUuid)
  );

  const isFavorite = useMemo(
    () => libraryIndex.isFavorite(catalogType, catalogUuid),
    [catalogType, catalogUuid, favoriteRevision, libraryIndex]
  );
  const setFavorite = useCallback(
    (nextFavorite: boolean) => {
      repository.setFavorite({
        catalogType,
        catalogUuid,
        isFavorite: nextFavorite,
      });
    },
    [catalogType, catalogUuid, repository]
  );
  const toggleFavorite = useCallback(() => {
    setFavorite(!isFavorite);
  }, [isFavorite, setFavorite]);

  return { isFavorite, setFavorite, toggleFavorite };
}

export type FavoriteSyncStatus = {
  state: 'saved' | 'waiting' | 'syncing' | 'needsAttention';
  pendingCount: number;
  unavailableCount: number;
  lastSuccessfulSyncAt?: Date;
  failure?: FavoriteSyncFailure;
  retryFailed(): void;
  discardRejected(): void;
};

export type FavoriteSyncFailure = {
  kind: 'retryable' | 'rejected';
  count: number;
  errorCode?: string;
  message: string;
};

export function useFavoriteSyncStatus(): FavoriteSyncStatus {
  const repository = useFavoriteRepository();
  const syncService = useFavoriteSyncService();
  const libraryIndex = useRootLibraryIndex();
  useSyncExternalStore(
    libraryIndex.subscribeLibraryMembership,
    libraryIndex.getLibraryMembershipSnapshot,
    libraryIndex.getLibraryMembershipSnapshot
  );
  const scopeId = repository.activeScopeId();
  const mutations = useQuery(
    FavoriteMutation,
    (query) => query.filtered('scopeId == $0', scopeId),
    [scopeId]
  );
  const syncStates = useQuery(
    FavoriteSyncState,
    (query) => query.filtered('scopeId == $0', scopeId),
    [scopeId]
  );
  const syncStateSnapshot = useSyncExternalStore(
    useCallback(
      (listener) => {
        syncStates.addListener(listener, [
          'runStatus',
          'lastErrorCode',
          'lastErrorMessage',
          'lastSuccessfulSyncAt',
        ]);
        return () => syncStates.removeListener(listener);
      },
      [syncStates]
    ),
    useCallback(() => favoriteSyncStateSnapshot(syncStates[0]), [syncStates]),
    () => ''
  );
  const unavailableFavorites = useQuery(
    UserFavorite,
    (query) =>
      query.filtered(
        'scopeId == $0 AND effectivePresent == true AND metadataStatus == $1',
        scopeId,
        FavoriteMetadataStatus.Unavailable
      ),
    [scopeId]
  );

  const retryFailed = useCallback(() => {
    repository.retryFailedMutations();
    syncService.retryNow();
  }, [repository, syncService]);
  const discardRejected = useCallback(() => {
    repository.discardRejectedMutations();
  }, [repository]);

  const mutationList = [...mutations];
  const pendingCount = mutationList.length;
  const syncState = useMemo(() => favoriteSyncStateView(syncStateSnapshot), [syncStateSnapshot]);
  const mutationFailure = buildFavoriteSyncFailure(mutationList);
  const runFailure = buildFavoriteSyncRunFailure(syncState);
  const hasInFlight = mutationList.some(
    (mutation) => mutation.state === FavoriteMutationState.InFlight
  );

  return {
    state: favoriteSyncPresentationState({
      runStatus: syncState?.runStatus,
      hasInFlightMutation: hasInFlight,
      hasRejectedMutation: mutationFailure?.kind === 'rejected',
      pendingMutationCount: pendingCount,
    }),
    pendingCount,
    unavailableCount: unavailableFavorites.length,
    lastSuccessfulSyncAt: syncState?.lastSuccessfulSyncAt,
    failure: mutationFailure ?? runFailure,
    retryFailed,
    discardRejected,
  };
}

function buildFavoriteSyncRunFailure(syncState: FavoriteSyncStateView) {
  if (syncState?.runStatus !== FavoriteSyncRunStatus.NeedsAttention) {
    return undefined;
  }

  return {
    kind: 'retryable' as const,
    count: 0,
    errorCode: syncState.lastErrorCode,
    message:
      syncState.lastErrorMessage ??
      'Relisten could not finish syncing your library. Try again when you are online.',
  };
}

function buildFavoriteSyncFailure(mutations: ReadonlyArray<FavoriteMutation>) {
  const rejected = mutations.filter(
    (mutation) => mutation.state === FavoriteMutationState.NeedsAttention
  );
  const retryable = mutations.filter(
    (mutation) => mutation.state === FavoriteMutationState.Pending && mutation.lastErrorCode != null
  );
  const failures = rejected.length > 0 ? rejected : retryable;
  if (failures.length === 0) {
    return undefined;
  }

  const latest = failures.reduce((current, mutation) =>
    mutation.updatedAt > current.updatedAt ? mutation : current
  );
  const kind: FavoriteSyncFailure['kind'] = rejected.length > 0 ? 'rejected' : 'retryable';

  return {
    kind,
    count: failures.length,
    errorCode: latest.lastErrorCode,
    message:
      latest.lastErrorMessage ??
      (kind === 'rejected'
        ? 'Relisten could not save this favorite change.'
        : 'Relisten could not reach your account. Your change is still on this device.'),
  };
}

export type AnonymousFavoriteImportHookState =
  | 'notApplicable'
  | 'none'
  | 'available'
  | 'deferred'
  | 'importing'
  | 'completed';

export function useAnonymousFavoriteImport() {
  const repository = useFavoriteRepository();
  const importService = useAnonymousLibraryImportService();
  const libraryIndex = useRootLibraryIndex();
  useSyncExternalStore(
    libraryIndex.subscribeLibraryMembership,
    libraryIndex.getLibraryMembershipSnapshot,
    libraryIndex.getLibraryMembershipSnapshot
  );
  const activeScopeId = repository.activeScopeId();
  const anonymousFavorites = useQuery(
    UserFavorite,
    (query) =>
      query.filtered('scopeId == $0 AND effectivePresent == true', ANONYMOUS_ACCOUNT_SCOPE_ID),
    []
  );
  const receipts = useQuery(
    AnonymousFavoriteImport,
    (query) => query.filtered('destinationScopeId == $0 SORT(createdAt DESC)', activeScopeId),
    [activeScopeId]
  );
  const sourceFingerprint = anonymousFavoriteSourceFingerprint(anonymousFavorites);
  const receipt = [...receipts].find(
    (candidate) => candidate.sourceFingerprint === sourceFingerprint
  );
  const unfinishedReceipt = [...receipts].find(
    (candidate) => candidate.state === AnonymousFavoriteImportState.Importing
  );

  const state: AnonymousFavoriteImportHookState =
    activeScopeId === ANONYMOUS_ACCOUNT_SCOPE_ID
      ? 'notApplicable'
      : anonymousFavorites.length === 0
        ? 'none'
        : receipt?.state === AnonymousFavoriteImportState.Deferred
          ? 'deferred'
          : receipt?.state === AnonymousFavoriteImportState.Importing
            ? 'importing'
            : receipt?.state === AnonymousFavoriteImportState.Completed
              ? 'completed'
              : unfinishedReceipt
                ? 'importing'
                : receipts.length > 0
                  ? 'deferred'
                  : 'available';

  const importToActiveAccount = useCallback(async () => {
    const capture = repository.captureScope();
    const installationUuid = await requireInstallationUuid();
    importService.importToActiveAccount(installationUuid, capture);
  }, [importService, repository]);

  const defer = useCallback(async () => {
    const capture = repository.captureScope();
    const installationUuid = await requireInstallationUuid();
    importService.defer(installationUuid, capture);
  }, [importService, repository]);

  return {
    state,
    anonymousFavoriteCount: anonymousFavorites.length,
    importToActiveAccount,
    defer,
  };
}
