import {
  AuthRequest,
  CodeChallengeMethod,
  DiscoveryDocument,
  Prompt,
  ResponseType,
  TokenResponse,
  exchangeCodeAsync,
  fetchDiscoveryAsync,
  refreshAsync,
} from 'expo-auth-session';
import { getRandomBytesAsync } from 'expo-crypto';
import { AccountRuntimeConfig } from '@/relisten/accounts/account_config';
import { createUuidV7 } from '@/relisten/util/uuid_v7';
import {
  AccountProvider,
  PendingAuthTransaction,
  RefreshTokenEnvelope,
} from './account_auth_types';
import { authTransactionExpiry } from './pkce_transaction';
import { AuthFlowError, normalizedIssuer, validateInitialIdToken } from './auth_validation';

export { AuthFlowError } from './auth_validation';

const ACCOUNT_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'user.read',
  'library.read',
  'library.write',
  'account.manage',
];

export interface PreparedAuthorization {
  authorizationUrl: string;
  transaction: PendingAuthTransaction;
}

export interface CandidateTokenSet {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  subject: string | null;
  nativeSessionId: string | null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function randomBase64Url(byteCount: number) {
  return base64Url(await getRandomBytesAsync(byteCount));
}

function assertEndpointBelongsToIssuer(endpoint: string, issuer: string, label: string) {
  const endpointUrl = new URL(endpoint);
  const issuerUrl = new URL(issuer);

  if (endpointUrl.origin !== issuerUrl.origin) {
    throw new AuthFlowError(
      `${label} does not belong to the configured issuer.`,
      'invalid_discovery'
    );
  }
}

function callbackMatches(actualValue: string, expectedValue: string): boolean {
  const actual = new URL(actualValue);
  const expected = new URL(expectedValue);

  return (
    actual.protocol === expected.protocol &&
    actual.hostname === expected.hostname &&
    actual.port === expected.port &&
    actual.pathname === expected.pathname &&
    actual.username === expected.username &&
    actual.password === expected.password
  );
}

function candidateFromTokenResponse(
  response: TokenResponse,
  identity: { subject: string | null; nativeSessionId: string | null }
): CandidateTokenSet {
  if (!response.refreshToken) {
    throw new AuthFlowError(
      'The authorization server did not rotate the refresh token.',
      'missing_refresh_token'
    );
  }

  if (!response.expiresIn || response.expiresIn <= 0) {
    throw new AuthFlowError('The access token lifetime is invalid.', 'invalid_token_response');
  }

  return {
    accessToken: response.accessToken,
    accessTokenExpiresAt: new Date((response.issuedAt + response.expiresIn) * 1000),
    refreshToken: response.refreshToken,
    subject: identity.subject,
    nativeSessionId: identity.nativeSessionId,
  };
}

export class AccountAuthClient {
  private discoveryPromise: Promise<DiscoveryDocument> | null = null;

  constructor(readonly config: AccountRuntimeConfig) {}

  async prepareAuthorization(
    provider: AccountProvider,
    forceAccountSelection: boolean
  ): Promise<PreparedAuthorization> {
    const discovery = await this.discovery();
    const nonce = await randomBase64Url(32);
    const request = new AuthRequest({
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      responseType: ResponseType.Code,
      scopes: ACCOUNT_SCOPES,
      usePKCE: true,
      codeChallengeMethod: CodeChallengeMethod.S256,
      prompt: forceAccountSelection ? Prompt.SelectAccount : undefined,
      extraParams: { nonce, provider },
    });
    await request.getAuthRequestConfigAsync();

    if (!request.codeVerifier) {
      throw new AuthFlowError('PKCE setup did not complete.', 'pkce_setup_failed');
    }

    const createdAt = new Date();
    return {
      authorizationUrl: await request.makeAuthUrlAsync(discovery),
      transaction: {
        version: 1,
        transactionId: createUuidV7(),
        provider,
        issuer: this.config.issuer,
        clientId: this.config.clientId,
        redirectUri: this.config.redirectUri,
        state: request.state,
        nonce,
        codeVerifier: request.codeVerifier,
        createdAt: createdAt.toISOString(),
        expiresAt: authTransactionExpiry(createdAt).toISOString(),
      },
    };
  }

  async exchangeCallback(
    callbackUrl: string,
    transaction: PendingAuthTransaction
  ): Promise<CandidateTokenSet> {
    if (!callbackMatches(callbackUrl, transaction.redirectUri)) {
      throw new AuthFlowError('The sign-in callback address is invalid.', 'callback_mismatch');
    }

    const callback = new URL(callbackUrl);

    if (callback.searchParams.get('state') !== transaction.state) {
      throw new AuthFlowError('The sign-in callback state is invalid.', 'state_mismatch');
    }

    const authorizationError = callback.searchParams.get('error');
    if (authorizationError) {
      throw new AuthFlowError(
        'The authorization server did not complete sign-in.',
        authorizationError,
        authorizationError === 'access_denied'
      );
    }

    const code = callback.searchParams.get('code');
    if (!code) {
      throw new AuthFlowError('The sign-in callback has no authorization code.', 'missing_code');
    }

    const response = await exchangeCodeAsync(
      {
        clientId: transaction.clientId,
        code,
        redirectUri: transaction.redirectUri,
        extraParams: { code_verifier: transaction.codeVerifier },
      },
      await this.discovery()
    );
    const identity = validateInitialIdToken(response.idToken, transaction);
    return candidateFromTokenResponse(response, identity);
  }

  async refresh(envelope: RefreshTokenEnvelope): Promise<CandidateTokenSet> {
    if (envelope.issuer !== this.config.issuer || envelope.clientId !== this.config.clientId) {
      throw new AuthFlowError(
        'The stored session does not match this app configuration.',
        'session_mismatch'
      );
    }

    const response = await refreshAsync(
      {
        clientId: envelope.clientId,
        refreshToken: envelope.refreshToken,
        scopes: ACCOUNT_SCOPES,
      },
      await this.discovery()
    );

    return candidateFromTokenResponse(response, {
      subject: envelope.userUuid,
      nativeSessionId: envelope.nativeSessionId,
    });
  }

  private discovery(): Promise<DiscoveryDocument> {
    if (!this.discoveryPromise) {
      this.discoveryPromise = this.loadDiscovery().catch((error) => {
        this.discoveryPromise = null;
        throw error;
      });
    }

    return this.discoveryPromise;
  }

  private async loadDiscovery(): Promise<DiscoveryDocument> {
    const discovery = await fetchDiscoveryAsync(this.config.issuer);
    const metadataIssuer = discovery.discoveryDocument?.issuer;

    if (
      !metadataIssuer ||
      normalizedIssuer(metadataIssuer) !== normalizedIssuer(this.config.issuer)
    ) {
      throw new AuthFlowError('OIDC discovery returned the wrong issuer.', 'invalid_discovery');
    }

    if (!discovery.authorizationEndpoint || !discovery.tokenEndpoint) {
      throw new AuthFlowError('OIDC discovery is missing required endpoints.', 'invalid_discovery');
    }

    assertEndpointBelongsToIssuer(
      discovery.authorizationEndpoint,
      this.config.issuer,
      'Authorization endpoint'
    );
    assertEndpointBelongsToIssuer(discovery.tokenEndpoint, this.config.issuer, 'Token endpoint');

    if (discovery.revocationEndpoint) {
      assertEndpointBelongsToIssuer(
        discovery.revocationEndpoint,
        this.config.issuer,
        'Revocation endpoint'
      );
    }

    return discovery;
  }
}
