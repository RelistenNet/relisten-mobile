const PRODUCTION_CATALOG_ORIGIN = 'https://api.relisten.net';
const DEVELOPMENT_CATALOG_ORIGIN = 'http://localhost:3823';

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
