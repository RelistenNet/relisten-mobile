import { describe, expect, it, vi } from 'vitest';
import {
  CatalogFetch,
  CatalogV4NetworkError,
  CatalogV4ParseError,
  CatalogV4ProtocolError,
  CatalogV4Transport,
} from './catalog_transport';

function response(body: string | null, init: ResponseInit) {
  return new Response(body, init);
}

describe('CatalogV4Transport', () => {
  it('sends a matching validator and accepts a bodyless 304', async () => {
    const fetch = vi.fn<CatalogFetch>(async () => response(null, { status: 304 }));
    const transport = new CatalogV4Transport({ apiBase: 'https://catalog.test/api', fetch });

    await expect(transport.getJson('/artists', 'W/"catalog"')).resolves.toMatchObject({
      status: 'not_modified',
      etag: 'W/"catalog"',
      metrics: { bodyBytes: 0, parseMilliseconds: 0 },
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe('https://catalog.test/api/v4/artists');
    expect(request!.method).toBe('GET');
    expect(new Headers(request!.headers).get('If-None-Match')).toBe('W/"catalog"');
  });

  it('parses a direct response and records decompressed JSON bytes and timings', async () => {
    const clocks = [10, 20, 24, 27];
    const transport = new CatalogV4Transport({
      apiBase: 'https://catalog.test/api',
      fetch: async () =>
        response('{"name":"Beyoncé"}', {
          status: 200,
          headers: { ETag: 'W/"artist"' },
        }),
      now: () => clocks.shift()!,
    });

    await expect(transport.getJson<{ name: string }>('/artists/artist_id')).resolves.toEqual({
      status: 'ok',
      data: { name: 'Beyoncé' },
      etag: 'W/"artist"',
      metrics: {
        bodyBytes: 19,
        downloadMilliseconds: 4,
        parseMilliseconds: 3,
        totalMilliseconds: 17,
      },
    });
  });

  it('does not send If-None-Match without an applied validator', async () => {
    const fetch = vi.fn<CatalogFetch>(async () =>
      response('[]', { status: 200, headers: { ETag: 'W/"empty"' } })
    );
    const transport = new CatalogV4Transport({ apiBase: 'https://catalog.test/api', fetch });

    await transport.getJson('/artists');

    const request = fetch.mock.calls[0]![1];
    expect(new Headers(request!.headers).has('If-None-Match')).toBe(false);
  });

  it('returns typed HTTP, network, parse, and protocol failures', async () => {
    const http = new CatalogV4Transport({
      apiBase: 'https://catalog.test/api',
      fetch: async () => response('{"code":"unavailable"}', { status: 503 }),
    });
    await expect(http.getJson('/artists')).rejects.toMatchObject({
      name: 'CatalogV4HttpError',
      status: 503,
      responseBody: '{"code":"unavailable"}',
    });

    const network = new CatalogV4Transport({
      apiBase: 'https://catalog.test/api',
      fetch: async () => {
        throw new TypeError('offline');
      },
    });
    await expect(network.getJson('/artists')).rejects.toBeInstanceOf(CatalogV4NetworkError);

    const parse = new CatalogV4Transport({
      apiBase: 'https://catalog.test/api',
      fetch: async () => response('not json', { status: 200, headers: { ETag: 'W/"bad"' } }),
    });
    await expect(parse.getJson('/artists')).rejects.toBeInstanceOf(CatalogV4ParseError);

    const missingEtag = new CatalogV4Transport({
      apiBase: 'https://catalog.test/api',
      fetch: async () => response('[]', { status: 200 }),
    });
    await expect(missingEtag.getJson('/artists')).rejects.toBeInstanceOf(CatalogV4ProtocolError);
  });

  it('rejects paths that could escape the configured catalog origin', async () => {
    const transport = new CatalogV4Transport({
      apiBase: 'https://catalog.test/api',
      fetch: vi.fn(),
    });

    await expect(transport.getJson('https://other.test/artists')).rejects.toBeInstanceOf(
      CatalogV4ProtocolError
    );
    await expect(transport.getJson('//other.test/artists')).rejects.toBeInstanceOf(
      CatalogV4ProtocolError
    );
  });
});
