import type { FavoriteSyncRunStatus } from './favorite_sync_presentation.ts';

export type FavoriteSyncStateView = {
  runStatus?: FavoriteSyncRunStatus;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastErrorRetryable: boolean;
  lastSuccessfulSyncAt?: Date;
};

type PersistedFavoriteSyncState = {
  runStatus: FavoriteSyncRunStatus;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastErrorRetryable: boolean;
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
    state.lastErrorRetryable,
    state.lastSuccessfulSyncAt?.getTime() ?? null,
  ]);
}

export function favoriteSyncStateView(snapshot: string): FavoriteSyncStateView {
  if (!snapshot) {
    return { lastErrorRetryable: false };
  }

  const [runStatus, lastErrorCode, lastErrorMessage, lastErrorRetryable, lastSuccessfulSyncAt] =
    JSON.parse(snapshot) as [
      FavoriteSyncRunStatus,
      string | null,
      string | null,
      boolean,
      number | null,
    ];

  return {
    runStatus,
    lastErrorCode: lastErrorCode ?? undefined,
    lastErrorMessage: lastErrorMessage ?? undefined,
    lastErrorRetryable,
    lastSuccessfulSyncAt: lastSuccessfulSyncAt == null ? undefined : new Date(lastSuccessfulSyncAt),
  };
}
