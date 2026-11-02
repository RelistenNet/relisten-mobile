const PRODUCTION_CATALOG_ORIGIN = 'https://api.relisten.net';
const DEVELOPMENT_CATALOG_ORIGIN = 'http://localhost:3823';

export type CatalogTransport = 'v3' | 'v4';

/**
 * V4 remains an explicit build-time pilot opt-in. Leaving the variable unset
 * preserves the released v2/v3 catalog behavior before the one-way cutover.
 */
export function catalogTransport(): CatalogTransport {
  const configured = process.env.EXPO_PUBLIC_RELISTEN_CATALOG_TRANSPORT?.trim();

  if (!configured || configured === 'v3') {
    return 'v3';
  }
  if (configured === 'v4') {
    return 'v4';
  }

  throw new Error('Relisten catalog transport must be either v3 or v4');
}

export function catalogApiBase() {
  const configured = process.env.EXPO_PUBLIC_RELISTEN_CATALOG_ORIGIN?.trim();
  const origin = (
    configured || (__DEV__ ? DEVELOPMENT_CATALOG_ORIGIN : PRODUCTION_CATALOG_ORIGIN)
  ).replace(/\/$/, '');
  const parsed = new URL(origin);
  const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Relisten catalog origin must not contain a path, query, or fragment');
  }
  if (parsed.protocol !== 'https:' && !(__DEV__ && isLoopback && parsed.protocol === 'http:')) {
    throw new Error('Relisten catalog origin must use HTTPS (development loopback may use HTTP)');
  }

  return `${origin}/api`;
}
