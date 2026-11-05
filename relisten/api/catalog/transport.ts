import { catalogApiBase } from '@/relisten/api/catalog_config';

export class CatalogHttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly responseBody: string
  ) {
    super(`Relisten catalog request failed with HTTP ${status}`);
    this.name = 'CatalogHttpError';
  }
}

export class CatalogNetworkError extends Error {
  constructor(
    readonly url: string,
    options?: ErrorOptions
  ) {
    super('Relisten catalog request failed before receiving a response', options);
    this.name = 'CatalogNetworkError';
  }
}

export class CatalogParseError extends Error {
  constructor(
    readonly url: string,
    options?: ErrorOptions
  ) {
    super('Relisten catalog returned invalid JSON', options);
    this.name = 'CatalogParseError';
  }
}

export class CatalogProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogProtocolError';
  }
}

export type CatalogFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface CatalogTransportOptions {
  apiBase?: string;
  fetch?: CatalogFetch;
}

export class CatalogTransport {
  private readonly apiBase: string;

  private readonly fetch: CatalogFetch;

  constructor(options: CatalogTransportOptions = {}) {
    this.apiBase = (options.apiBase ?? catalogApiBase()).replace(/\/$/, '');
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** No-store endpoints and commands return their typed JSON without retaining it. */
  async requestJson<T>(path: string, body?: object): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new CatalogProtocolError('Catalog paths must be origin-relative');
    }
    const url = `${this.apiBase}/v4${path}`;
    const response =
      body === undefined
        ? await this.fetchGet(url, new Headers({ Accept: 'application/json' }))
        : await this.fetch(url, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
    if (!response.ok) {
      throw new CatalogHttpError(url, response.status, await response.text());
    }
    return response.json() as Promise<T>;
  }

  /** Retry transient GET failures only; commands must not be duplicated. */
  private async fetchGet(url: string, headers: Headers): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      let delay = 100 * 2 ** attempt;
      try {
        const response = await this.fetch(url, { headers, method: 'GET' });
        const transient =
          response.status === 408 || response.status === 429 || response.status >= 500;
        if (!transient || attempt === 3) return response;
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          const seconds = Number(retryAfter);
          const wait = Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(retryAfter) - Date.now();
          // Leave longer server-directed waits to a later refresh, rather than retry early.
          if (wait > 30_000) return response;
          if (Number.isFinite(wait)) delay = Math.max(delay, wait);
        }
        // Release failed bodies before the next attempt, especially for large responses.
        await response.body?.cancel();
      } catch (error) {
        if (attempt === 3) throw new CatalogNetworkError(url, { cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  async getJson<T>(path: string): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new CatalogProtocolError('Catalog paths must be origin-relative');
    }

    const url = `${this.apiBase}/v4${path}`;
    const headers = new Headers({ Accept: 'application/json' });
    const response = await this.fetchGet(url, headers);

    if (!response.ok) {
      let responseBody = '';
      try {
        responseBody = await response.text();
      } catch {
        // The status and URL still identify the failed request when its body cannot be read.
      }
      throw new CatalogHttpError(url, response.status, responseBody);
    }

    const responseBody = await response.text();
    let data: T;
    try {
      data = JSON.parse(responseBody) as T;
    } catch (error) {
      throw new CatalogParseError(url, { cause: error });
    }

    return data;
  }
}
