import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Realm from 'realm';

const testDoubles = vi.hoisted(() => {
  const fetch = vi.fn();
  const constructV4 = vi.fn();
  const wretchClient = {
    fetch,
    middlewares: vi.fn(),
  };
  wretchClient.middlewares.mockReturnValue(wretchClient);

  return { constructV4, fetch, wretchClient };
});

vi.mock('wretch', () => ({
  default: vi.fn(() => testDoubles.wretchClient),
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { MD5: 'MD5' },
  digestStringAsync: vi.fn(async () => 'legacy-etag'),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('@/relisten/api/retry_middleware', () => ({
  retry: vi.fn(() => (next: unknown) => next),
}));

vi.mock('@/relisten/api/catalog_config', () => ({
  catalogApiBase: () => 'https://catalog.example/api',
  catalogTransport: () => 'v3',
}));

vi.mock('@/relisten/realm/schema', () => ({ realm: undefined }));

vi.mock('@/relisten/api/v4/catalog_client', () => ({
  CatalogV4Client: class {
    constructor(...args: unknown[]) {
      testDoubles.constructV4(...args);
    }
  },
}));

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { RelistenApiClient, RelistenApiResponseType } from './client';

describe('RelistenApiClient catalog transport selection', () => {
  const realm = {} as Realm;

  beforeEach(() => {
    testDoubles.fetch.mockReset();
    testDoubles.constructV4.mockReset();
  });

  it('uses the legacy v3 route without constructing v4', async () => {
    testDoubles.fetch.mockReturnValue({
      res: async () =>
        new Response(
          JSON.stringify([
            {
              uuid: '00000000-0000-4000-8000-000000000001',
              updated_at: '2026-10-31T00:00:00Z',
            },
          ]),
          { status: 200 }
        ),
    });
    const client = new RelistenApiClient({ catalogTransport: 'v3' });

    const response = await client.artists(true);

    expect(client.usesV4Catalog()).toBe(false);
    expect(testDoubles.constructV4).not.toHaveBeenCalled();
    const [method, path] = testDoubles.fetch.mock.calls[0]!;
    expect([method, path]).toEqual(['GET', '/v3/artists?include_autocreated=true']);
    expect(response.type).toBe(RelistenApiResponseType.OnlineRequestCompleted);
  });

  it('constructs the explicit v4 client only when v4 is selected with Realm', () => {
    const client = new RelistenApiClient({ realm, catalogTransport: 'v4' });

    expect(client.usesV4Catalog()).toBe(true);
    expect(testDoubles.constructV4.mock.calls[0]?.[0]).toBe(realm);
  });
});
