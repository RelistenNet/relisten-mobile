import { AccountsApiError } from '@/relisten/accounts/api/accounts_api_client';

export class FavoriteMetadataHydrationError extends Error {
  readonly code = 'favorite_metadata_incomplete';

  constructor(readonly unresolvedCount: number) {
    super('Some synced favorites could not be loaded from the music catalog.');
    this.name = 'FavoriteMetadataHydrationError';
  }
}

export function favoriteSyncFailure(error: unknown, hasLocalSnapshot: boolean) {
  if (error instanceof FavoriteMetadataHydrationError) {
    return {
      code: error.code,
      message:
        error.unresolvedCount === 1
          ? 'One synced favorite could not be loaded. Try again to finish setting up your library.'
          : `${error.unresolvedCount} synced favorites could not be loaded. Try again to finish setting up your library.`,
    };
  }

  if (error instanceof AccountsApiError) {
    return {
      code: error.code ?? 'favorite_sync_failed',
      message: error.retryable
        ? hasLocalSnapshot
          ? 'Relisten could not reach your account. Your last synced library is still available on this device.'
          : 'Relisten could not load your account library yet. Try again when you are online.'
        : 'Relisten could not update your library. Try again, or sign in again if the problem continues.',
    };
  }

  return {
    code: 'favorite_sync_failed',
    message: hasLocalSnapshot
      ? 'Relisten could not finish syncing your library. Try again when you are online.'
      : 'Relisten could not load your account library yet. Try again when you are online.',
  };
}
