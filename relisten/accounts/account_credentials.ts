import { AccountScopeCapture } from './account_scope_store';
import { AccountProfileSnapshot, parseAccountProfileResponse } from './api/account_profile';
import { AccountsApiTransport } from './api/accounts_api_client';
import { AccountAuthClient, AuthFlowError, CandidateTokenSet } from './auth/auth_client';
import { RefreshTokenEnvelope } from './auth/account_auth_types';
import {
  clearRefreshTokenEnvelope,
  readRefreshTokenEnvelope,
  writeRefreshTokenEnvelope,
} from './auth/secure_tokens';

interface InMemoryAccessToken {
  value: string;
  expiresAt: Date;
  userUuid: string;
  nativeSessionId: string;
}

export interface ValidatedCredentials {
  candidate: CandidateTokenSet;
  profile: AccountProfileSnapshot;
  envelope: RefreshTokenEnvelope;
}

export class AccountCredentials {
  private accessToken: InMemoryAccessToken | null = null;
  private refreshEnvelope: RefreshTokenEnvelope | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly authClient: AccountAuthClient,
    private readonly transport: AccountsApiTransport
  ) {}

  readStored() {
    return readRefreshTokenEnvelope();
  }

  activeEnvelope() {
    return this.refreshEnvelope;
  }

  stageEnvelope(envelope: RefreshTokenEnvelope) {
    this.refreshEnvelope = envelope;
  }

  async accessTokenForLogout(
    capture: AccountScopeCapture,
    assertCurrent: () => void
  ): Promise<string | null> {
    const accessToken = this.freshAccessToken(capture, 0);
    if (accessToken) {
      return accessToken;
    }

    const envelope = this.refreshEnvelope;
    if (
      !capture.isAuthenticated ||
      !envelope ||
      envelope.userUuid !== capture.userUuid ||
      envelope.nativeSessionId !== capture.nativeSessionId
    ) {
      return null;
    }

    // A logout refresh is deliberately transient. Persisting its rotated refresh
    // token would let a slow request race the local credential deletion that follows.
    const candidate = await this.authClient.refresh(envelope);
    assertCurrent();
    return candidate.accessToken;
  }

  clearMemory() {
    this.accessToken = null;
    this.refreshEnvelope = null;
  }

  freshAccessToken(capture: AccountScopeCapture, refreshMarginMs: number): string | null {
    if (
      this.accessToken &&
      this.accessToken.userUuid === capture.userUuid &&
      this.accessToken.nativeSessionId === capture.nativeSessionId &&
      this.accessToken.expiresAt.getTime() - Date.now() > refreshMarginMs
    ) {
      return this.accessToken.value;
    }

    return null;
  }

  async rotate(
    envelope: RefreshTokenEnvelope,
    assertCurrent?: () => void
  ): Promise<ValidatedCredentials> {
    const candidate = await this.authClient.refresh(envelope);
    assertCurrent?.();

    // Refresh tokens are one-time credentials. Replace the durable copy before making
    // the fallible /v1/me request so an offline response cannot strand the token family.
    const rotatedEnvelope: RefreshTokenEnvelope = {
      ...envelope,
      refreshToken: candidate.refreshToken,
    };
    this.refreshEnvelope = rotatedEnvelope;
    await this.mutate(() => writeRefreshTokenEnvelope(rotatedEnvelope));

    return this.validate(candidate, envelope.userUuid);
  }

  async validate(
    candidate: CandidateTokenSet,
    expectedUserUuid: string | null
  ): Promise<ValidatedCredentials> {
    const value = await this.transport.request<unknown>('/v1/me', candidate.accessToken, {
      method: 'GET',
    });
    const profile = parseAccountProfileResponse(value);

    if (expectedUserUuid && profile.userUuid !== expectedUserUuid) {
      throw new AuthFlowError(
        'The account identity does not match the token subject.',
        'subject_mismatch'
      );
    }

    if (candidate.nativeSessionId && candidate.nativeSessionId !== profile.nativeSessionId) {
      throw new AuthFlowError(
        'The account session does not match the identity token.',
        'session_mismatch'
      );
    }

    return {
      candidate,
      profile,
      envelope: {
        version: 1,
        refreshToken: candidate.refreshToken,
        issuer: this.authClient.config.issuer,
        clientId: this.authClient.config.clientId,
        userUuid: profile.userUuid,
        nativeSessionId: profile.nativeSessionId,
      },
    };
  }

  async persist(credentials: ValidatedCredentials): Promise<void> {
    await this.mutate(() => writeRefreshTokenEnvelope(credentials.envelope));
  }

  activate(credentials: ValidatedCredentials) {
    const { candidate, envelope, profile } = credentials;
    this.refreshEnvelope = envelope;
    this.accessToken = {
      value: candidate.accessToken,
      expiresAt: candidate.accessTokenExpiresAt,
      userUuid: profile.userUuid,
      nativeSessionId: profile.nativeSessionId,
    };
  }

  clearPersisted(): Promise<void> {
    return this.mutate(clearRefreshTokenEnvelope);
  }

  private mutate(operation: () => Promise<void>): Promise<void> {
    const next = this.mutationQueue.then(operation, operation);
    this.mutationQueue = next.catch(() => undefined);
    return next;
  }
}
