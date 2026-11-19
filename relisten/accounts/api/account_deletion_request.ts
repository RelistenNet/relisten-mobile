import { log } from '@/relisten/util/logging';
import { isTerminalRefreshFailure } from '../account_errors';
import { AccountsApiError, AuthorizedAccountsApiClient } from './accounts_api_client';

const logger = log.extend('account-deletion');
const RETRY_DELAYS_MS = [1000, 3000] as const;

/**
 * - `accepted`: the server recorded the deletion and will purge the account.
 * - `sessionEnded`: the session stopped working. Either an earlier request
 *   already purged the account, or the session expired for another reason.
 *   The app can't tell which.
 * - `notSent`: the session changed before the first attempt, so nothing was
 *   sent and the account is untouched.
 */
export type AccountDeletionOutcome = 'accepted' | 'sessionEnded' | 'notSent';

/** The request body. The Apple code, when there is one, lets the server revoke Apple's tokens. */
export interface AccountDeletionPayload {
  apple_native_authorization_code?: string;
}

/**
 * Sends `POST /v1/account-deletions` for the signed-in account.
 *
 * Repeating the request is safe. The server keeps one deletion job per account,
 * and the session stays valid until the purge runs. So a network error or a
 * `503` (Temporal didn't confirm the start) is retried a few times before the
 * error reaches the listener, who can try again.
 *
 * Every attempt sends the same payload, so a retry never asks Apple again.
 * `isCurrent` is checked before each attempt: a deletion confirmed by one
 * session must never be sent by another.
 */
export class AccountDeletionRequest {
  constructor(
    private readonly accountsApi: AuthorizedAccountsApiClient,
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms))
  ) {}

  async send(
    payload: AccountDeletionPayload,
    isCurrent: () => boolean
  ): Promise<AccountDeletionOutcome> {
    const body = JSON.stringify(payload);
    for (let attempt = 0; ; attempt += 1) {
      if (!isCurrent()) {
        // After a failed attempt the server may still have accepted it.
        return attempt === 0 ? 'notSent' : 'sessionEnded';
      }

      try {
        await this.accountsApi.request<unknown>('/v1/account-deletions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        logger.info('Account deletion accepted');
        return 'accepted';
      } catch (error) {
        // The client already refreshed once on a 401. A terminal refresh
        // failure means the server no longer knows this session.
        if (isTerminalRefreshFailure(error)) {
          logger.info('Account deletion found the session ended');
          return 'sessionEnded';
        }

        const retryDelay = RETRY_DELAYS_MS[attempt];
        if (isRetryable(error) && retryDelay !== undefined) {
          await this.wait(retryDelay);
          continue;
        }

        throw describeFailure(error);
      }
    }
  }
}

function isRetryable(error: unknown) {
  return error instanceof AccountsApiError && error.retryable;
}

function describeFailure(error: unknown): unknown {
  if (!(error instanceof AccountsApiError)) {
    return error;
  }

  // The server answers 404 while account deletion is switched off.
  if (error.status === 404) {
    return new AccountsApiError(
      "Account deletion isn't available yet. Email team@relisten.net and we'll delete your account.",
      404,
      'account_deletion_unavailable',
      false
    );
  }

  if (error.retryable) {
    return new AccountsApiError(
      "Relisten couldn't start deleting your account. Check your connection and try again.",
      error.status,
      'account_deletion_failed',
      true
    );
  }

  return error;
}
