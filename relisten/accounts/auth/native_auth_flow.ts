import * as WebBrowser from 'expo-web-browser';
import { TokenError } from 'expo-auth-session';
import { AccountProvider } from './account_auth_types';
import { AccountAuthClient, AuthFlowError, CandidateTokenSet } from './auth_client';
import {
  clearPendingAuthTransaction,
  isExpiredAuthTransaction,
  readPendingAuthTransaction,
  writePendingAuthTransaction,
} from './pkce_transaction';

export type BrowserAuthorizationResult =
  | { type: 'cancelled' }
  | { type: 'callback'; callbackUrl: string };

export class NativeAuthFlow {
  constructor(private readonly authClient: AccountAuthClient) {}

  async open(
    provider: AccountProvider,
    forceAccountSelection: boolean
  ): Promise<BrowserAuthorizationResult> {
    try {
      const authorization = await this.authClient.prepareAuthorization(
        provider,
        forceAccountSelection
      );
      await writePendingAuthTransaction(authorization.transaction);
      const result = await WebBrowser.openAuthSessionAsync(
        authorization.authorizationUrl,
        authorization.transaction.redirectUri,
        { preferUniversalLinks: this.authClient.config.useUniversalLinkCallback }
      );

      if (result.type === 'cancel' || result.type === 'dismiss') {
        await clearPendingAuthTransaction();
        return { type: 'cancelled' };
      }

      if (result.type !== 'success') {
        await clearPendingAuthTransaction();
        throw new AuthFlowError('The system browser did not finish sign-in.', 'browser_incomplete');
      }

      return { type: 'callback', callbackUrl: result.url };
    } catch (error) {
      await clearPendingAuthTransaction().catch(() => undefined);
      throw error;
    }
  }

  async exchangeCallback(callbackUrl: string): Promise<CandidateTokenSet | 'cancelled'> {
    const pending = await readPendingAuthTransaction();

    if (pending.state === 'temporarilyUnavailable') {
      throw new AuthFlowError(
        'Unlock this device to finish Relisten sign-in.',
        'credentials_temporarily_unavailable'
      );
    }

    if (pending.state === 'missing' || isExpiredAuthTransaction(pending.value)) {
      await clearPendingAuthTransaction();
      throw new AuthFlowError(
        'This sign-in attempt expired. Try again.',
        'auth_transaction_expired'
      );
    }

    if (
      pending.value.issuer !== this.authClient.config.issuer ||
      pending.value.clientId !== this.authClient.config.clientId ||
      pending.value.redirectUri !== this.authClient.config.redirectUri
    ) {
      await clearPendingAuthTransaction().catch(() => undefined);
      throw new AuthFlowError(
        'This sign-in attempt belongs to another app configuration.',
        'auth_transaction_mismatch'
      );
    }

    try {
      return await this.authClient.exchangeCallback(callbackUrl, pending.value);
    } catch (error) {
      if (!(error instanceof AuthFlowError) && !(error instanceof TokenError)) {
        // A transport interruption may leave the authorization code usable. Preserve the
        // protected verifier so the callback can be retried after a process restart.
        throw error;
      }

      await clearPendingAuthTransaction().catch(() => undefined);

      if (error instanceof AuthFlowError && error.cancelled) {
        return 'cancelled';
      }

      throw error;
    }
  }
}
