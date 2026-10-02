import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ os: 'ios' }));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platform.os;
    },
  },
}));

import { getAccountRuntimeConfig } from './account_config';

beforeEach(() => {
  platform.os = 'ios';
  vi.stubGlobal('__DEV__', false);
  vi.stubEnv('EXPO_PUBLIC_RELISTEN_AUTH_ISSUER', '');
  vi.stubEnv('EXPO_PUBLIC_RELISTEN_ACCOUNTS_ORIGIN', '');
  vi.stubEnv('EXPO_PUBLIC_RELISTEN_OIDC_IOS_CLIENT_ID', '');
  vi.stubEnv('EXPO_PUBLIC_RELISTEN_OIDC_ANDROID_CLIENT_ID', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getAccountRuntimeConfig', () => {
  it('uses the claimed HTTPS callback for production iOS', () => {
    expect(getAccountRuntimeConfig()).toMatchObject({
      clientId: 'relisten-mobile-ios',
      redirectUri: 'https://relisten.net/auth/mobile/ios/callback',
      useUniversalLinkCallback: true,
    });
  });

  it('keeps the private callback for iOS development', () => {
    vi.stubGlobal('__DEV__', true);

    expect(getAccountRuntimeConfig()).toMatchObject({
      clientId: 'relisten-mobile-ios-dev',
      redirectUri: 'net.relisten.mobile:/oauth2redirect/ios',
      useUniversalLinkCallback: false,
    });
  });

  it('does not enable universal-link preference for production Android', () => {
    platform.os = 'android';

    expect(getAccountRuntimeConfig()).toMatchObject({
      clientId: 'relisten-mobile-android',
      redirectUri: 'https://relisten.net/auth/mobile/android/callback',
      useUniversalLinkCallback: false,
    });
  });
});
