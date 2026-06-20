import {
  getRelistenCatalogApiBaseUrl,
  getRelistenUserLibraryApiBaseUrl,
} from '@/relisten/api/config';
import { RelistenUserLibraryApiClient, UserLibraryFetch } from '@/relisten/api/user_library_client';

export const CATALOG_LOCAL_API_PROBE_PATH = '/v3/artists?include_autocreated=false';
export const USER_LIBRARY_LOCAL_API_PROBE_PATH = '/users/check-username/relisten_probe';

export interface LocalApiBaseUrlProbeOptions {
  catalogApiBaseUrl?: string;
  userLibraryApiBaseUrl?: string;
  fetchFn?: UserLibraryFetch;
}

export interface LocalApiBaseUrlProbeResult {
  catalogRequestUrl: string;
  userLibraryRequestUrl: string;
  catalogOk: boolean;
  userLibraryOk: boolean;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export async function runLocalApiBaseUrlProbe(
  options: LocalApiBaseUrlProbeOptions = {}
): Promise<LocalApiBaseUrlProbeResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const catalogBaseUrl = withoutTrailingSlash(
    options.catalogApiBaseUrl ?? getRelistenCatalogApiBaseUrl()
  );
  const userLibraryClient = new RelistenUserLibraryApiClient({
    baseUrl: options.userLibraryApiBaseUrl ?? getRelistenUserLibraryApiBaseUrl(),
    fetchFn,
  });
  const catalogRequestUrl = `${catalogBaseUrl}${CATALOG_LOCAL_API_PROBE_PATH}`;
  const userLibraryRequestUrl = userLibraryClient.urlForPath(USER_LIBRARY_LOCAL_API_PROBE_PATH);

  const [catalogResponse, userLibraryResponse] = await Promise.allSettled([
    fetchFn(catalogRequestUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    }),
    userLibraryClient.getJson<unknown>(USER_LIBRARY_LOCAL_API_PROBE_PATH),
  ]);

  return {
    catalogRequestUrl,
    userLibraryRequestUrl,
    catalogOk: catalogResponse.status === 'fulfilled' && catalogResponse.value.ok,
    userLibraryOk: userLibraryResponse.status === 'fulfilled',
  };
}
