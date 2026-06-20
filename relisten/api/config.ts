// Keep catalog and user-library bases separate. The catalog API is read-heavy
// and cacheable; the user-library API is auth/mutation-heavy and uses a
// different request policy in RelistenUserLibraryApiClient.
export const PRODUCTION_CATALOG_API_BASE_URL = 'https://api.relisten.net/api';
export const PRODUCTION_USER_LIBRARY_API_BASE_URL = 'https://api.relisten.net';

export const LOCAL_IOS_SIMULATOR_CATALOG_API_BASE_URL = 'http://localhost:3823/api';
export const LOCAL_IOS_SIMULATOR_USER_LIBRARY_API_BASE_URL = 'http://localhost:5119';

export const CATALOG_API_BASE_URL_ENV = 'EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL';
export const USER_LIBRARY_API_BASE_URL_ENV = 'EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL';

export interface RelistenApiBaseUrls {
  catalogApiBaseUrl: string;
  userLibraryApiBaseUrl: string;
}

type ApiBaseUrlEnv = Record<string, string | undefined>;

function normalizedBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function envBaseUrl(env: ApiBaseUrlEnv, envName: keyof ApiBaseUrlEnv, fallback: string): string {
  const value = env[envName];

  if (value && value.trim().length > 0) {
    return normalizedBaseUrl(value);
  }

  return fallback;
}

export function relistenApiBaseUrlEnvFromProcess(): ApiBaseUrlEnv {
  return {
    [CATALOG_API_BASE_URL_ENV]: process.env.EXPO_PUBLIC_RELISTEN_CATALOG_API_BASE_URL,
    [USER_LIBRARY_API_BASE_URL_ENV]: process.env.EXPO_PUBLIC_RELISTEN_USER_API_BASE_URL,
  };
}

export function resolveRelistenApiBaseUrls(
  env: ApiBaseUrlEnv = relistenApiBaseUrlEnvFromProcess()
): RelistenApiBaseUrls {
  return {
    catalogApiBaseUrl: envBaseUrl(env, CATALOG_API_BASE_URL_ENV, PRODUCTION_CATALOG_API_BASE_URL),
    userLibraryApiBaseUrl: envBaseUrl(
      env,
      USER_LIBRARY_API_BASE_URL_ENV,
      PRODUCTION_USER_LIBRARY_API_BASE_URL
    ),
  };
}

export function getRelistenCatalogApiBaseUrl(
  env: ApiBaseUrlEnv = relistenApiBaseUrlEnvFromProcess()
): string {
  return resolveRelistenApiBaseUrls(env).catalogApiBaseUrl;
}

export function getRelistenUserLibraryApiBaseUrl(
  env: ApiBaseUrlEnv = relistenApiBaseUrlEnvFromProcess()
): string {
  return resolveRelistenApiBaseUrls(env).userLibraryApiBaseUrl;
}
