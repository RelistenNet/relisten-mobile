import {
  FavoriteAccountScopeCapture,
  FavoriteRepository,
} from '@/relisten/library/favorite_repository';
import { resumedFavoriteSyncRunStatus } from '@/relisten/library/favorite_sync_presentation';
import { FavoriteSyncRunStatus, FavoriteSyncState } from '@/relisten/realm/models/library';

/** Owns the durable user-facing state of the favorites sync loop. */
export class FavoriteSyncRunStateStore {
  constructor(private readonly repository: FavoriteRepository) {}

  current(scopeId: string) {
    return this.repository.realm.objects(FavoriteSyncState).filtered('scopeId == $0', scopeId)[0];
  }

  markInitialWaiting(capture: FavoriteAccountScopeCapture) {
    const existing = this.current(capture.scopeId);
    const resumedStatus = resumedFavoriteSyncRunStatus(
      existing?.runStatus,
      !!existing?.lastSuccessfulSyncAt
    );
    if (resumedStatus !== existing?.runStatus) {
      this.update(capture, FavoriteSyncRunStatus.Waiting);
    }
  }

  update(
    capture: FavoriteAccountScopeCapture,
    status: FavoriteSyncRunStatus,
    errorCode?: string,
    errorMessage?: string,
    errorRetryable = false
  ) {
    if (!this.repository.isCaptureCurrent(capture)) {
      return;
    }

    this.repository.realm.write(() => {
      if (!this.repository.isCaptureCurrent(capture)) {
        return;
      }

      const syncState = this.repository.syncState(capture.scopeId);
      syncState.runStatus = status;
      syncState.lastErrorCode = errorCode;
      syncState.lastErrorMessage = errorMessage;
      syncState.lastErrorRetryable = errorRetryable;
      syncState.updatedAt = new Date();
    });
  }
}
