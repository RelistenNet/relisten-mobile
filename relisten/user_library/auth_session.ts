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

export class UserLibraryAuthSessionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'UserLibraryAuthSessionError';
  }
}

export class UserLibraryAuthSessionService {
  private accessToken: string | undefined;
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
    if (this.accessToken) {
      return this.accessToken;
    }

    const refreshToken = await this.refreshTokenStore.getRefreshToken();

    if (!refreshToken) {
      return undefined;
    }

    return (await this.refreshSession()).access_token;
  }

  async refreshSession(): Promise<UserLibraryAuthTokenResponse> {
    const generation = this.sessionGeneration;

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
      }

      throw error;
    }

    if (generation !== this.sessionGeneration) {
      await this.refreshTokenStore.clearRefreshToken();
      throw new UserLibraryAuthSessionError('session_changed');
    }

    this.accessToken = response.access_token;
  }
}

function isUnauthorizedApiError(error: unknown) {
  return error instanceof UserLibraryApiError && error.status === 401;
}

function isDevelopmentBuild() {
  return typeof __DEV__ === 'boolean' && __DEV__;
}
