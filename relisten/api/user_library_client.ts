import { getRelistenUserLibraryApiBaseUrl } from '@/relisten/api/config';

export type UserLibraryAccessTokenProvider = () => Promise<string | undefined>;
export type UserLibraryFetch = typeof fetch;

export interface UserLibraryApiClientOptions {
  baseUrl?: string;
  fetchFn?: UserLibraryFetch;
  accessTokenProvider?: UserLibraryAccessTokenProvider;
}

export interface UserLibraryRequestOptions {
  accessToken?: string;
  headers?: HeadersInit;
}

export class UserLibraryApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    message: string
  ) {
    super(message);
  }
}

export class RelistenUserLibraryApiClient {
  static API_BASE = getRelistenUserLibraryApiBaseUrl();

  private readonly baseUrl: string;
  private readonly fetchFn: UserLibraryFetch;
  private readonly accessTokenProvider?: UserLibraryAccessTokenProvider;

  constructor(options: UserLibraryApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? RelistenUserLibraryApiClient.API_BASE).replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
    this.accessTokenProvider = options.accessTokenProvider;
  }

  public getJson<T>(path: string, options?: UserLibraryRequestOptions): Promise<T> {
    return this.makeJsonRequest<T>('GET', path, undefined, options);
  }

  public postJson<T>(path: string, body: object, options?: UserLibraryRequestOptions): Promise<T> {
    return this.makeJsonRequest<T>('POST', path, body, options);
  }

  public putJson<T>(path: string, body: object, options?: UserLibraryRequestOptions): Promise<T> {
    return this.makeJsonRequest<T>('PUT', path, body, options);
  }

  public patchJson<T>(path: string, body: object, options?: UserLibraryRequestOptions): Promise<T> {
    return this.makeJsonRequest<T>('PATCH', path, body, options);
  }

  public async deleteJson<T>(path: string, options?: UserLibraryRequestOptions): Promise<T> {
    return this.makeJsonRequest<T>('DELETE', path, undefined, options);
  }

  public urlForPath(path: string): string {
    return `${this.baseUrl}${this.libraryPath(path)}`;
  }

  private libraryPath(path: string): string {
    if (path.startsWith('/api/v3/library')) {
      return path;
    }

    if (path.startsWith('/')) {
      return `/api/v3/library${path}`;
    }

    return `/api/v3/library/${path}`;
  }

  private async makeJsonRequest<T>(
    method: string,
    path: string,
    body?: object,
    options: UserLibraryRequestOptions = {}
  ): Promise<T> {
    const requestPath = this.libraryPath(path);
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    headers.set('Cache-Control', 'no-store');
    headers.set('Pragma', 'no-cache');

    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    const accessToken = options.accessToken ?? (await this.accessTokenProvider?.());

    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const response = await this.fetchFn(`${this.baseUrl}${requestPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new UserLibraryApiError(
        response.status,
        method,
        requestPath,
        errorBody || `User-library API request failed with status ${response.status}`
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
