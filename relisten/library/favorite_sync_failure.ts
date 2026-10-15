import { AccountsApiError } from '@/relisten/accounts/api/accounts_api_client';
import { AuthFlowError } from '@/relisten/accounts/auth/auth_validation';
import { favoriteSyncErrorIsRetryable } from '@/relisten/library/favorite_mutation_batch_isolation';

export function favoriteSyncFailure(error: unknown, hasLocalSnapshot: boolean) {
  if (error instanceof AccountsApiError) {
    const code = error.code ?? 'favorite_sync_failed';
    const retryable = favoriteSyncErrorIsRetryable(code, error.retryable);
    return {
      code,
      retryable,
      message: retryable
        ? hasLocalSnapshot
          ? 'Relisten could not reach your account. Your last synced library is still available on this device.'
          : 'Relisten could not load your account library yet. Try again when you are online.'
        : 'Relisten could not update your library. Try again, or sign in again if the problem continues.',
    };
  }

  if (error instanceof AuthFlowError) {
    return {
      code: error.code,
      retryable: error.retryable,
      message: error.retryable
        ? hasLocalSnapshot
          ? 'Relisten could not reach your account. Your last synced favorites are still available on this device.'
          : 'Relisten could not load your account favorites yet. Try again when the account service is reachable.'
        : 'Your Relisten sign-in needs attention. Try again, then sign in again if the problem continues.',
    };
  }

  return {
    code: 'favorite_sync_failed',
    retryable: false,
    message: hasLocalSnapshot
      ? 'Relisten hit a problem while syncing. Your last synced library is still available on this device.'
      : 'Relisten hit a problem while loading your account library. Try again.',
  };
}
