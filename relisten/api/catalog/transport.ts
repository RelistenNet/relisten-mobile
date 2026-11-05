import { catalogApiBase } from '@/relisten/api/catalog_config';

export interface CatalogResponse<T> {
  status: 'ok';
  data: T;
  etag: string;
}

export interface CatalogNotModifiedResponse {
  status: 'not_modified';
  etag: string;
}

export type CatalogGetResponse<T> = CatalogResponse<T> | CatalogNotModifiedResponse;

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
    const response = await this.fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new CatalogHttpError(url, response.status, await response.text());
    }
    return response.json() as Promise<T>;
  }

  async getJson<T>(path: string, appliedEtag?: string): Promise<CatalogGetResponse<T>> {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new CatalogProtocolError('Catalog paths must be origin-relative');
    }

    const url = `${this.apiBase}/v4${path}`;
    const headers = new Headers({ Accept: 'application/json' });
    if (appliedEtag) {
      headers.set('If-None-Match', appliedEtag);
    }

    let response: Response;
    try {
      response = await this.fetch(url, { headers, method: 'GET' });
    } catch (error) {
      throw new CatalogNetworkError(url, { cause: error });
    }

    if (response.status === 304) {
      const etag = response.headers.get('etag') ?? appliedEtag;
      if (!etag) {
        throw new CatalogProtocolError('A 304 response requires the matching request validator');
      }

      return {
        status: 'not_modified',
        etag,
      };
    }

    if (!response.ok) {
      let responseBody = '';
      try {
        responseBody = await response.text();
      } catch {
        // The status and URL still identify the failed request when its body cannot be read.
      }
      throw new CatalogHttpError(url, response.status, responseBody);
    }

    const etag = response.headers.get('etag');
    if (!etag) {
      throw new CatalogProtocolError('A successful catalog response must include an ETag');
    }

    const responseBody = await response.text();
    let data: T;
    try {
      data = JSON.parse(responseBody) as T;
    } catch (error) {
      throw new CatalogParseError(url, { cause: error });
    }

    return {
      status: 'ok',
      data,
      etag,
    };
  }
}
