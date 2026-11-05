import { describe, expect, it, vi } from 'vitest';
import {
  CatalogFetch,
  CatalogNetworkError,
  CatalogParseError,
  CatalogProtocolError,
  CatalogTransport,
} from './transport';

function response(body: string | null, init: ResponseInit) {
  return new Response(body, init);
}

describe('CatalogTransport', () => {
  it('sends a matching validator and accepts a bodyless 304', async () => {
    const fetch = vi.fn<CatalogFetch>(async () => response(null, { status: 304 }));
    const transport = new CatalogTransport({ apiBase: 'https://catalog.test/api', fetch });

    await expect(transport.getJson('/artists', 'W/"catalog"')).resolves.toMatchObject({
      status: 'not_modified',
      etag: 'W/"catalog"',
    });

    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe('https://catalog.test/api/v4/artists');
    expect(request!.method).toBe('GET');
    expect(new Headers(request!.headers).get('If-None-Match')).toBe('W/"catalog"');
  });

  it('parses a direct response without changing Unicode text', async () => {
    const transport = new CatalogTransport({
      apiBase: 'https://catalog.test/api',
      fetch: async () =>
        response('{"name":"Beyoncé"}', {
          status: 200,
          headers: { ETag: 'W/"artist"' },
        }),
    });

    await expect(transport.getJson<{ name: string }>('/artists/artist_id')).resolves.toEqual({
      status: 'ok',
      data: { name: 'Beyoncé' },
      etag: 'W/"artist"',
    });
  });

  it('does not send If-None-Match without an applied validator', async () => {
    const fetch = vi.fn<CatalogFetch>(async () =>
      response('[]', { status: 200, headers: { ETag: 'W/"empty"' } })
    );
    const transport = new CatalogTransport({ apiBase: 'https://catalog.test/api', fetch });

    await transport.getJson('/artists');

    const request = fetch.mock.calls[0]![1];
    expect(new Headers(request!.headers).has('If-None-Match')).toBe(false);
  });

  it('returns typed HTTP, network, parse, and protocol failures', async () => {
    const http = new CatalogTransport({
      apiBase: 'https://catalog.test/api',
      fetch: async () => response('{"code":"unavailable"}', { status: 503 }),
    });
    await expect(http.getJson('/artists')).rejects.toMatchObject({
      name: 'CatalogHttpError',
      status: 503,
      responseBody: '{"code":"unavailable"}',
    });

    const network = new CatalogTransport({
      apiBase: 'https://catalog.test/api',
      fetch: async () => {
        throw new TypeError('offline');
      },
    });
    await expect(network.getJson('/artists')).rejects.toBeInstanceOf(CatalogNetworkError);

    const parse = new CatalogTransport({
      apiBase: 'https://catalog.test/api',
      fetch: async () => response('not json', { status: 200, headers: { ETag: 'W/"bad"' } }),
    });
    await expect(parse.getJson('/artists')).rejects.toBeInstanceOf(CatalogParseError);

    const missingEtag = new CatalogTransport({
      apiBase: 'https://catalog.test/api',
      fetch: async () => response('[]', { status: 200 }),
    });
    await expect(missingEtag.getJson('/artists')).rejects.toBeInstanceOf(CatalogProtocolError);
  });

  it('rejects paths that could escape the configured catalog origin', async () => {
    const transport = new CatalogTransport({
      apiBase: 'https://catalog.test/api',
      fetch: vi.fn(),
    });

    await expect(transport.getJson('https://other.test/artists')).rejects.toBeInstanceOf(
      CatalogProtocolError
    );
    await expect(transport.getJson('//other.test/artists')).rejects.toBeInstanceOf(
      CatalogProtocolError
    );
  });
});
