import {
  getRelistenCatalogApiBaseUrl,
  getRelistenUserLibraryApiBaseUrl,
} from '@/relisten/api/config';
import { UserLibraryFetch } from '@/relisten/api/user_library_client';

export const CATALOG_LOCAL_API_PROBE_PATH = '/v3/artists?include_autocreated=false';
export const USER_LIBRARY_LOCAL_API_PROBE_PATH = '/health';

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

// Development smoke only: prove both configured bases are reachable without
// constructing either full client or mutating local user-library state.
export async function runLocalApiBaseUrlProbe(
  options: LocalApiBaseUrlProbeOptions = {}
): Promise<LocalApiBaseUrlProbeResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const catalogBaseUrl = withoutTrailingSlash(
    options.catalogApiBaseUrl ?? getRelistenCatalogApiBaseUrl()
  );
  const userLibraryBaseUrl = withoutTrailingSlash(
    options.userLibraryApiBaseUrl ?? getRelistenUserLibraryApiBaseUrl()
  );
  const catalogRequestUrl = `${catalogBaseUrl}${CATALOG_LOCAL_API_PROBE_PATH}`;
  const userLibraryRequestUrl = `${userLibraryBaseUrl}${USER_LIBRARY_LOCAL_API_PROBE_PATH}`;

  const [catalogResponse, userLibraryResponse] = await Promise.allSettled([
    fetchFn(catalogRequestUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    }),
    fetchFn(userLibraryRequestUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/plain',
      },
    }),
  ]);

  return {
    catalogRequestUrl,
    userLibraryRequestUrl,
    catalogOk: catalogResponse.status === 'fulfilled' && catalogResponse.value.ok,
    userLibraryOk: userLibraryResponse.status === 'fulfilled' && userLibraryResponse.value.ok,
  };
}
