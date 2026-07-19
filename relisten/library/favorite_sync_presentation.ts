export type FavoriteSyncPresentationState = 'saved' | 'waiting' | 'syncing' | 'needsAttention';

export type FavoriteSyncRunStatus = 'waiting' | 'syncing' | 'saved' | 'needs_attention';

export function resumedFavoriteSyncRunStatus(
  runStatus: FavoriteSyncRunStatus | undefined,
  hasLocalSnapshot: boolean
): FavoriteSyncRunStatus {
  if (runStatus === 'needs_attention') {
    return runStatus;
  }
  if (!hasLocalSnapshot || runStatus === undefined || runStatus === 'syncing') {
    return 'waiting';
  }
  return runStatus;
}

export function favoriteSyncPresentationState(options: {
  runStatus?: FavoriteSyncRunStatus;
  hasInFlightMutation: boolean;
  hasRejectedMutation: boolean;
  pendingMutationCount: number;
}): FavoriteSyncPresentationState {
  if (options.hasRejectedMutation || options.runStatus === 'needs_attention') {
    return 'needsAttention';
  }
  if (options.hasInFlightMutation || options.runStatus === 'syncing') {
    return 'syncing';
  }
  if (
    options.pendingMutationCount > 0 ||
    options.runStatus === undefined ||
    options.runStatus === 'waiting'
  ) {
    return 'waiting';
  }
  return 'saved';
}
