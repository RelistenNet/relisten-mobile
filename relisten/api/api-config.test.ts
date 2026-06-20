import { describe, expect, it, vi } from 'vitest';
import {
  CATALOG_API_BASE_URL_ENV,
  getRelistenCatalogApiBaseUrl,
  getRelistenUserLibraryApiBaseUrl,
  LOCAL_IOS_SIMULATOR_CATALOG_API_BASE_URL,
  LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL,
  PRODUCTION_CATALOG_API_BASE_URL,
  PRODUCTION_USER_LIBRARY_API_BASE_URL,
  relistenApiBaseUrlEnvFromProcess,
  resolveRelistenApiBaseUrls,
  USER_LIBRARY_API_BASE_URL_ENV,
} from '@/relisten/api/config';
import {
  CATALOG_LOCAL_API_PROBE_PATH,
  runLocalApiBaseUrlProbe,
} from '@/relisten/api/local_api_probe';
import { RelistenUserLibraryApiClient } from '@/relisten/api/user_library_client';

describe('API base URL config', () => {
  it('defaults catalog and user-library APIs to production bases', () => {
    expect(resolveRelistenApiBaseUrls({})).toEqual({
      catalogApiBaseUrl: PRODUCTION_CATALOG_API_BASE_URL,
      userLibraryApiBaseUrl: PRODUCTION_USER_LIBRARY_API_BASE_URL,
    });
  });

  it('uses separate explicit env overrides for iOS Simulator local development', () => {
    const env = {
      [CATALOG_API_BASE_URL_ENV]: `${LOCAL_IOS_SIMULATOR_CATALOG_API_BASE_URL}/`,
      [USER_LIBRARY_API_BASE_URL_ENV]: `${LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL}/`,
    };

    expect(getRelistenCatalogApiBaseUrl(env)).toBe(LOCAL_IOS_SIMULATOR_CATALOG_API_BASE_URL);
    expect(getRelistenUserLibraryApiBaseUrl(env)).toBe(
      LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL
    );
  });

  it('reads Expo public env vars through static process.env references', () => {
    const previousCatalogApiBaseUrl = process.env.EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL;
    const previousUserApiBaseUrl = process.env.EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL;

    try {
      process.env.EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL =
        LOCAL_IOS_SIMULATOR_CATALOG_API_BASE_URL;
      process.env.EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL =
        LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL;

      expect(resolveRelistenApiBaseUrls(relistenApiBaseUrlEnvFromProcess())).toEqual({
        catalogApiBaseUrl: LOCAL_IOS_SIMULATOR_CATALOG_API_BASE_URL,
        userLibraryApiBaseUrl: LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL,
      });
    } finally {
      process.env.EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL = previousCatalogApiBaseUrl;
      process.env.EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL = previousUserApiBaseUrl;
    }
  });
});

describe('RelistenUserLibraryApiClient', () => {
  it('prefixes library paths and sends no-store headers', async () => {
    const fetchFn = vi.fn(async () => {
      return Response.json({ ok: true });
    });
    const client = new RelistenUserLibraryApiClient({
      baseUrl: LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL,
      fetchFn: fetchFn as typeof fetch,
    });

    await client.getJson('/users/me');

    expect(fetchFn).toHaveBeenCalledWith(
      `${LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL}/api/v3/library/users/me`,
      expect.objectContaining({
        method: 'GET',
        body: undefined,
      })
    );

    const calls = fetchFn.mock.calls as unknown as [string, RequestInit][];
    const request = calls[0][1];
    const headers = request.headers as Headers;
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('Pragma')).toBe('no-cache');
  });

  it('injects bearer tokens through an auth seam without owning token storage', async () => {
    const fetchFn = vi.fn(async () => {
      return Response.json({ ok: true });
    });
    const client = new RelistenUserLibraryApiClient({
      baseUrl: LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL,
      fetchFn: fetchFn as typeof fetch,
      accessTokenProvider: async () => 'access-token',
    });

    await client.postJson('/playlists', { name: 'Road tapes' });

    const [[url, request]] = fetchFn.mock.calls as unknown as [string, RequestInit][];
    const headers = request.headers as Headers;
    expect(url).toBe(`${LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL}/api/v3/library/playlists`);
    expect(request.body).toBe(JSON.stringify({ name: 'Road tapes' }));
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('does not expose server response bodies through API error messages', async () => {
    const fetchFn = vi.fn(async () => {
      return new Response('sensitive server body', { status: 500 });
    });
    const client = new RelistenUserLibraryApiClient({
      baseUrl: LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL,
      fetchFn: fetchFn as typeof fetch,
    });

    await expect(client.getJson('/users/me')).rejects.toMatchObject({
      message: 'User-library API request failed with status 500',
      method: 'GET',
      path: '/api/v3/library/users/me',
      status: 500,
    });
  });
});

describe('runLocalApiBaseUrlProbe', () => {
  it('probes the selected catalog and user-library bases', async () => {
    const fetchFn = vi.fn(async () => {
      return Response.json({ ok: true });
    });

    const result = await runLocalApiBaseUrlProbe({
      catalogApiBaseUrl: LOCAL_IOS_SIMULATOR_CATALOG_API_BASE_URL,
      userLibraryApiBaseUrl: LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL,
      fetchFn: fetchFn as typeof fetch,
    });

    expect(result).toEqual({
      catalogRequestUrl: `${LOCAL_IOS_SIMULATOR_CATALOG_API_BASE_URL}${CATALOG_LOCAL_API_PROBE_PATH}`,
      userLibraryRequestUrl: `${LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL}/health`,
      catalogOk: true,
      userLibraryOk: true,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      `${LOCAL_IOS_SIMULATOR_CATALOG_API_BASE_URL}${CATALOG_LOCAL_API_PROBE_PATH}`,
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchFn).toHaveBeenCalledWith(
      `${LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL}/health`,
      expect.objectContaining({
        headers: { Accept: 'text/plain' },
        method: 'GET',
      })
    );
  });
});
