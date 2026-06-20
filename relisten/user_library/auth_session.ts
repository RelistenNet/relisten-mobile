import {
  RelistenUserLibraryApiClient,
  UserLibraryApiError,
} from '@/relisten/api/user_library_client';

export interface UserLibraryCurrentUser {
  user_uuid: string;
  username: string;
  display_name?: string | null;
  scope_id: string;
}

export interface UserLibrarySession {
  session_uuid: string;
  device_id: string;
  device_name?: string | null;
  platform: string;
  last_used_at: string;
  created_at: string;
  revoked_at?: string | null;
}

export interface UserLibraryAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  user: UserLibraryCurrentUser;
  session: UserLibrarySession;
}

export interface DevelopmentSessionRequest {
  username: string;
  display_name?: string;
  device_id: string;
  device_name?: string;
  platform: 'ios' | 'android' | 'web';
}

export interface UserLibraryRefreshTokenStore {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(refreshToken: string): Promise<void>;
  clearRefreshToken(): Promise<void>;
}

export interface UserLibraryAuthSessionServiceOptions {
  developmentAuthEnabled?: boolean;
}

export interface UserLibraryAuthenticatedRequestSession {
  accessToken: string;
  scopeId: string;
}

export interface UserLibraryAuthenticatedRetryOptions {
  expectedScopeId?: string;
}

export class UserLibraryAuthSessionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'UserLibraryAuthSessionError';
  }
}

export class UserLibraryAuthSessionService {
  // Access tokens stay in memory. The refresh token store is injected so the
  // production path can use SecureStore and tests can use deterministic fakes.
  private accessToken: string | undefined;
  private accessTokenScopeId: string | undefined;
  private refreshInFlight:
    | { generation: number; promise: Promise<UserLibraryAuthTokenResponse> }
    | undefined;
  private sessionGeneration = 0;
  private readonly developmentAuthEnabled: boolean;

  constructor(
    private readonly client: RelistenUserLibraryApiClient,
    private readonly refreshTokenStore: UserLibraryRefreshTokenStore,
    options: UserLibraryAuthSessionServiceOptions = {}
  ) {
    this.developmentAuthEnabled = options.developmentAuthEnabled ?? isDevelopmentBuild();
  }

  async signInDevelopmentSession(
    request: DevelopmentSessionRequest
  ): Promise<UserLibraryAuthTokenResponse> {
    if (!this.developmentAuthEnabled) {
      throw new UserLibraryAuthSessionError('development_auth_disabled');
    }

    const generation = this.sessionGeneration;
    const response = await this.client.postJson<UserLibraryAuthTokenResponse>(
      '/auth/development/session',
      request
    );
    await this.applyTokenResponse(response, generation);
    return response;
  }

  async getAccessToken(): Promise<string | undefined> {
    return (await this.getAuthenticatedRequestSession())?.accessToken;
  }

  async getAuthenticatedRequestSession(
    expectedScopeId?: string
  ): Promise<UserLibraryAuthenticatedRequestSession | undefined> {
    if (this.accessToken && this.accessTokenScopeId) {
      if (!expectedScopeId || this.accessTokenScopeId === expectedScopeId) {
        return {
          accessToken: this.accessToken,
          scopeId: this.accessTokenScopeId,
        };
      }

      this.accessToken = undefined;
      this.accessTokenScopeId = undefined;
    }

    const refreshToken = await this.refreshTokenStore.getRefreshToken();

    if (!refreshToken) {
      return undefined;
    }

    return this.sessionForExpectedScope(
      authenticatedRequestSessionFromTokenResponse(await this.refreshSession()),
      expectedScopeId
    );
  }

  async refreshSession(): Promise<UserLibraryAuthTokenResponse> {
    const generation = this.sessionGeneration;

    // Coalesce concurrent 401 refreshes, but only within the current session
    // generation. Sign-out increments the generation so stale refresh results
    // cannot repopulate tokens after the user leaves the scope.
    if (!this.refreshInFlight || this.refreshInFlight.generation !== generation) {
      const promise = this.refreshSessionOnce(generation).finally(() => {
        if (this.refreshInFlight?.promise === promise) {
          this.refreshInFlight = undefined;
        }
      });
      this.refreshInFlight = { generation, promise };
    }

    return this.refreshInFlight.promise;
  }

  async signOut(): Promise<void> {
    const refreshToken = await this.refreshTokenStore.getRefreshToken();
    this.sessionGeneration += 1;
    this.refreshInFlight = undefined;
    this.accessToken = undefined;
    this.accessTokenScopeId = undefined;

    try {
      if (refreshToken) {
        await this.client.postJson<void>('/auth/logout', { refresh_token: refreshToken });
      }
    } finally {
      await this.refreshTokenStore.clearRefreshToken();
    }
  }

  async withAuthenticatedRetry<T>(
    request: (accessToken: string | undefined) => Promise<T>
  ): Promise<T> {
    const accessToken = await this.getAccessToken();

    try {
      return await request(accessToken);
    } catch (error) {
      if (!isUnauthorizedApiError(error) || !(await this.refreshTokenStore.getRefreshToken())) {
        throw error;
      }
    }

    const refreshed = await this.refreshSession();
    return request(refreshed.access_token);
  }

  async withAuthenticatedSessionRetry<T>(
    request: (session: UserLibraryAuthenticatedRequestSession | undefined) => Promise<T>,
    options: UserLibraryAuthenticatedRetryOptions = {}
  ): Promise<T> {
    const session = await this.getAuthenticatedRequestSession(options.expectedScopeId);

    try {
      return await request(session);
    } catch (error) {
      if (!isUnauthorizedApiError(error) || !(await this.refreshTokenStore.getRefreshToken())) {
        throw error;
      }
    }

    const refreshed = this.sessionForExpectedScope(
      authenticatedRequestSessionFromTokenResponse(await this.refreshSession()),
      options.expectedScopeId
    );
    return request(refreshed);
  }

  private async refreshSessionOnce(generation: number): Promise<UserLibraryAuthTokenResponse> {
    const refreshToken = await this.refreshTokenStore.getRefreshToken();

    if (!refreshToken) {
      this.accessToken = undefined;
      throw new UserLibraryAuthSessionError('missing_refresh_token');
    }

    let response: UserLibraryAuthTokenResponse;

    try {
      response = await this.client.postJson<UserLibraryAuthTokenResponse>('/auth/refresh', {
        refresh_token: refreshToken,
      });
    } catch (error) {
      if (isUnauthorizedApiError(error) && generation === this.sessionGeneration) {
        this.sessionGeneration += 1;
        this.refreshInFlight = undefined;
        this.accessToken = undefined;
        this.accessTokenScopeId = undefined;
        await this.refreshTokenStore.clearRefreshToken();
      }

      throw error;
    }

    await this.applyTokenResponse(response, generation);
    return response;
  }

  private async applyTokenResponse(response: UserLibraryAuthTokenResponse, generation: number) {
    if (generation !== this.sessionGeneration) {
      throw new UserLibraryAuthSessionError('session_changed');
    }

    try {
      await this.refreshTokenStore.setRefreshToken(response.refresh_token);
    } catch (error) {
      if (generation === this.sessionGeneration) {
        this.accessToken = undefined;
        this.accessTokenScopeId = undefined;
      }

      throw error;
    }

    // Re-check after the async SecureStore write. A sign-out during that write
    // must win even if the server already returned a valid token response.
    if (generation !== this.sessionGeneration) {
      await this.refreshTokenStore.clearRefreshToken();
      throw new UserLibraryAuthSessionError('session_changed');
    }

    this.accessToken = response.access_token;
    this.accessTokenScopeId = response.user.scope_id;
  }

  private sessionForExpectedScope(
    session: UserLibraryAuthenticatedRequestSession,
    expectedScopeId: string | undefined
  ): UserLibraryAuthenticatedRequestSession | undefined {
    if (!expectedScopeId || session.scopeId === expectedScopeId) {
      return session;
    }

    this.accessToken = undefined;
    this.accessTokenScopeId = undefined;
    return undefined;
  }
}

function isUnauthorizedApiError(error: unknown) {
  return error instanceof UserLibraryApiError && error.status === 401;
}

function authenticatedRequestSessionFromTokenResponse(
  response: UserLibraryAuthTokenResponse
): UserLibraryAuthenticatedRequestSession {
  return {
    accessToken: response.access_token,
    scopeId: response.user.scope_id,
  };
}

function isDevelopmentBuild() {
  return typeof __DEV__ === 'boolean' && __DEV__;
}
