import {
  AccountScopeCapture,
  AccountScopeSource,
  StaleAccountScopeError,
} from '@/relisten/accounts/account_scope_store';
import { log } from '@/relisten/util/logging';
import { AccountProblemDetails, UpdateUsernameRequest } from './account_contract';
import { AccountProfileSnapshot, parseAccountProfileResponse } from './account_profile';

const logger = log.extend('accounts-api');

export class AccountsApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
    readonly retryable: boolean,
    readonly problem: Readonly<AccountProblemDetails> | null = null
  ) {
    super(message);
    this.name = 'AccountsApiError';
  }
}

export interface AccountTokenSource {
  getAccessToken(capture: AccountScopeCapture, forceRefresh?: boolean): Promise<string>;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function assertRelativeAccountPath(path: string) {
  if (!path.startsWith('/v1/') || path.startsWith('//') || path.includes('://')) {
    throw new Error('Authenticated account requests require a relative /v1/ path');
  }
}

export class AccountsApiTransport {
  private readonly origin: string;

  constructor(origin: string) {
    this.origin = origin.replace(/\/$/, '');
  }

  async request<T>(path: string, accessToken: string, options: RequestInit): Promise<T> {
    assertRelativeAccountPath(path);
    const method = options.method ?? 'GET';
    const logPath = path.split(/[?#]/, 1)[0];
    logger.info(`${method} ${logPath}`);
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${accessToken}`);

    let response: Response;

    try {
      response = await fetch(`${this.origin}${path}`, {
        ...options,
        credentials: 'omit',
        headers,
      });
    } catch {
      logger.warn(`${method} ${logPath} failed before response`);
      throw new AccountsApiError('The account service could not be reached.', null, null, true);
    }

    logger.info(`${method} ${logPath} completed status=${response.status}`);

    if (!response.ok) {
      const problem = await this.readProblem(response);
      throw new AccountsApiError(
        problem?.detail ?? problem?.title ?? 'The account request failed.',
        response.status,
        problem?.code ?? null,
        isRetryableStatus(response.status),
        problem
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      logger.warn(`${method} ${logPath} returned invalid JSON`);
      throw new AccountsApiError(
        'The account service returned an invalid response.',
        502,
        null,
        false
      );
    }
  }

  private async readProblem(response: Response): Promise<AccountProblemDetails | null> {
    if (!response.headers.get('content-type')?.includes('json')) {
      return null;
    }

    try {
      const value = await response.json();
      return value && typeof value === 'object' ? (value as AccountProblemDetails) : null;
    } catch {
      return null;
    }
  }
}

export class AuthorizedAccountsApiClient {
  constructor(
    private readonly transport: AccountsApiTransport,
    private readonly scopeSource: AccountScopeSource,
    private readonly tokenSource: AccountTokenSource
  ) {}

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const capture = this.scopeSource.capture();

    if (!capture.isAuthenticated) {
      throw new AccountsApiError('Sign in to use this account feature.', 401, 'signed_out', false);
    }

    let accessToken = await this.tokenSource.getAccessToken(capture);
    let response: T;

    try {
      response = await this.transport.request<T>(path, accessToken, options);
    } catch (error) {
      if (!(error instanceof AccountsApiError) || error.status !== 401) {
        throw error;
      }

      accessToken = await this.tokenSource.getAccessToken(capture, true);
      response = await this.transport.request<T>(path, accessToken, options);
    }

    if (!this.scopeSource.isCurrent(capture)) {
      throw new StaleAccountScopeError();
    }

    return response;
  }

  async getMe(): Promise<AccountProfileSnapshot> {
    return parseAccountProfileResponse(await this.request<unknown>('/v1/me'));
  }

  async updateUsername(request: UpdateUsernameRequest): Promise<AccountProfileSnapshot> {
    return parseAccountProfileResponse(
      await this.request<unknown>('/v1/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
    );
  }
}
