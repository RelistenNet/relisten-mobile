import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogApiBase } from './catalog_config';

describe('catalog configuration', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps the configured origin pathless and appends only api', () => {
    vi.stubEnv('EXPO_PUBLIC_RELISTEN_CATALOG_ORIGIN', 'http://127.0.0.1:43823/');
    expect(catalogApiBase()).toBe('http://127.0.0.1:43823/api');

    vi.stubEnv('EXPO_PUBLIC_RELISTEN_CATALOG_ORIGIN', 'http://127.0.0.1:43823/api');
    expect(() => catalogApiBase()).toThrow('must not contain a path');
  });
});
