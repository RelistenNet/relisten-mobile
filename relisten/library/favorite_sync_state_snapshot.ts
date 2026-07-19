import type { FavoriteSyncRunStatus } from './favorite_sync_presentation.ts';

export type FavoriteSyncStateView = {
  runStatus?: FavoriteSyncRunStatus;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastSuccessfulSyncAt?: Date;
};

type PersistedFavoriteSyncState = {
  runStatus: FavoriteSyncRunStatus;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastSuccessfulSyncAt?: Date;
};

/**
 * Captures the user-visible sync fields as a primitive value. Realm keeps a
 * live object identity while mutating its properties, so returning that object
 * from a hook can leave React holding a snapshot whose contents changed in
 * place without an observable identity change.
 */
export function favoriteSyncStateSnapshot(state?: PersistedFavoriteSyncState): string {
  if (!state) {
    return '';
  }

  return JSON.stringify([
    state.runStatus,
    state.lastErrorCode ?? null,
    state.lastErrorMessage ?? null,
    state.lastSuccessfulSyncAt?.getTime() ?? null,
  ]);
}

export function favoriteSyncStateView(snapshot: string): FavoriteSyncStateView {
  if (!snapshot) {
    return {};
  }

  const [runStatus, lastErrorCode, lastErrorMessage, lastSuccessfulSyncAt] = JSON.parse(
    snapshot
  ) as [FavoriteSyncRunStatus, string | null, string | null, number | null];

  return {
    runStatus,
    lastErrorCode: lastErrorCode ?? undefined,
    lastErrorMessage: lastErrorMessage ?? undefined,
    lastSuccessfulSyncAt: lastSuccessfulSyncAt == null ? undefined : new Date(lastSuccessfulSyncAt),
  };
}
