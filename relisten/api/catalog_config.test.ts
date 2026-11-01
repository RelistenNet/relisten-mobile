import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogApiBase, catalogTransport } from './catalog_config';

describe('catalog configuration', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps v3 as the default and opts into v4 explicitly', () => {
    vi.stubEnv('EXPO_PUBLIC_RELISTEN_CATALOG_TRANSPORT', '');
    expect(catalogTransport()).toBe('v3');

    vi.stubEnv('EXPO_PUBLIC_RELISTEN_CATALOG_TRANSPORT', 'v4');
    expect(catalogTransport()).toBe('v4');

    vi.stubEnv('EXPO_PUBLIC_RELISTEN_CATALOG_TRANSPORT', 'v3');
    expect(catalogTransport()).toBe('v3');
  });

  it('rejects a misspelled transport instead of changing behavior silently', () => {
    vi.stubEnv('EXPO_PUBLIC_RELISTEN_CATALOG_TRANSPORT', 'V4');
    expect(() => catalogTransport()).toThrow('must be either v3 or v4');
  });

  it('keeps the configured origin pathless and appends only api', () => {
    vi.stubEnv('EXPO_PUBLIC_RELISTEN_CATALOG_ORIGIN', 'http://127.0.0.1:43823/');
    expect(catalogApiBase()).toBe('http://127.0.0.1:43823/api');

    vi.stubEnv('EXPO_PUBLIC_RELISTEN_CATALOG_ORIGIN', 'http://127.0.0.1:43823/api');
    expect(() => catalogApiBase()).toThrow('must not contain a path');
  });
});
