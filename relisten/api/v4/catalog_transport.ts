import { catalogApiBase } from '@/relisten/api/catalog_config';

export interface CatalogV4RequestMetrics {
  downloadMilliseconds: number;
  parseMilliseconds: number;
  totalMilliseconds: number;
}

export interface CatalogV4Response<T> {
  status: 'ok';
  data: T;
  etag: string;
  metrics: CatalogV4RequestMetrics;
}

export interface CatalogV4NotModifiedResponse {
  status: 'not_modified';
  etag: string;
  metrics: CatalogV4RequestMetrics;
}

export type CatalogV4GetResponse<T> = CatalogV4Response<T> | CatalogV4NotModifiedResponse;

export class CatalogV4HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly responseBody: string
  ) {
    super(`Relisten catalog request failed with HTTP ${status}`);
    this.name = 'CatalogV4HttpError';
  }
}

export class CatalogV4NetworkError extends Error {
  constructor(
    readonly url: string,
    options?: ErrorOptions
  ) {
    super('Relisten catalog request failed before receiving a response', options);
    this.name = 'CatalogV4NetworkError';
  }
}

export class CatalogV4ParseError extends Error {
  constructor(
    readonly url: string,
    options?: ErrorOptions
  ) {
    super('Relisten catalog returned invalid JSON', options);
    this.name = 'CatalogV4ParseError';
  }
}

export class CatalogV4ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogV4ProtocolError';
  }
}

export type CatalogFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface CatalogV4TransportOptions {
  apiBase?: string;
  fetch?: CatalogFetch;
  now?: () => number;
}

const emptyMetrics = (totalMilliseconds: number): CatalogV4RequestMetrics => ({
  downloadMilliseconds: 0,
  parseMilliseconds: 0,
  totalMilliseconds,
});

export class CatalogV4Transport {
  private readonly apiBase: string;

  private readonly fetch: CatalogFetch;

  private readonly now: () => number;

  constructor(options: CatalogV4TransportOptions = {}) {
    this.apiBase = (options.apiBase ?? catalogApiBase()).replace(/\/$/, '');
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => performance.now());
  }

  /** No-store endpoints and commands return their typed JSON without retaining it. */
  async requestJson<T>(path: string, body?: object): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new CatalogV4ProtocolError('V4 catalog paths must be origin-relative');
    }
    const url = `${this.apiBase}/v4${path}`;
    const response = await this.fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new CatalogV4HttpError(url, response.status, await response.text());
    }
    return response.json() as Promise<T>;
  }

  async getJson<T>(path: string, appliedEtag?: string): Promise<CatalogV4GetResponse<T>> {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new CatalogV4ProtocolError('V4 catalog paths must be origin-relative');
    }

    const url = `${this.apiBase}/v4${path}`;
    const headers = new Headers({ Accept: 'application/json' });
    if (appliedEtag) {
      headers.set('If-None-Match', appliedEtag);
    }

    const startedAt = this.now();
    let response: Response;
    try {
      response = await this.fetch(url, { headers, method: 'GET' });
    } catch (error) {
      throw new CatalogV4NetworkError(url, { cause: error });
    }

    if (response.status === 304) {
      const etag = response.headers.get('etag') ?? appliedEtag;
      if (!etag) {
        throw new CatalogV4ProtocolError('A 304 response requires the matching request validator');
      }

      return {
        status: 'not_modified',
        etag,
        metrics: emptyMetrics(this.now() - startedAt),
      };
    }

    if (!response.ok) {
      let responseBody = '';
      try {
        responseBody = await response.text();
      } catch {
        // The status and URL still identify the failed request when its body cannot be read.
      }
      throw new CatalogV4HttpError(url, response.status, responseBody);
    }

    const etag = response.headers.get('etag');
    if (!etag) {
      throw new CatalogV4ProtocolError('A successful v4 catalog response must include an ETag');
    }

    const downloadStartedAt = this.now();
    const responseBody = await response.text();
    const parseStartedAt = this.now();
    let data: T;
    try {
      data = JSON.parse(responseBody) as T;
    } catch (error) {
      throw new CatalogV4ParseError(url, { cause: error });
    }
    const completedAt = this.now();

    return {
      status: 'ok',
      data,
      etag,
      metrics: {
        downloadMilliseconds: parseStartedAt - downloadStartedAt,
        parseMilliseconds: completedAt - parseStartedAt,
        totalMilliseconds: completedAt - startedAt,
      },
    };
  }
}
