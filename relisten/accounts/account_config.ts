import { Platform } from 'react-native';

export interface AccountRuntimeConfig {
  issuer: string;
  accountsOrigin: string;
  clientId: string;
  redirectUri: string;
  useUniversalLinkCallback: boolean;
}

function configuredValue(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function withoutTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

function assertSecureOrigin(value: string, label: string) {
  const parsed = new URL(value);
  const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${label} must be an origin without a path, query, or fragment`);
  }

  if (parsed.protocol !== 'https:' && !(__DEV__ && isLoopback && parsed.protocol === 'http:')) {
    throw new Error(`${label} must use HTTPS (development loopback may use HTTP)`);
  }
}

export function getAccountRuntimeConfig(): AccountRuntimeConfig {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Relisten account sign-in is available only on iOS and Android');
  }

  const platform = Platform.OS;
  const localIssuer = 'http://localhost:5443';
  const productionIssuer = 'https://auth.relisten.net';
  const productionAccountsOrigin = 'https://accounts.relisten.net';
  const issuer = withoutTrailingSlash(
    configuredValue(
      process.env.EXPO_PUBLIC_RELISTEN_AUTH_ISSUER,
      __DEV__ ? localIssuer : productionIssuer
    )
  );
  const accountsOrigin = withoutTrailingSlash(
    configuredValue(
      process.env.EXPO_PUBLIC_RELISTEN_ACCOUNTS_ORIGIN,
      __DEV__ ? localIssuer : productionAccountsOrigin
    )
  );
  const clientId = configuredValue(
    platform === 'ios'
      ? process.env.EXPO_PUBLIC_RELISTEN_OIDC_IOS_CLIENT_ID
      : process.env.EXPO_PUBLIC_RELISTEN_OIDC_ANDROID_CLIENT_ID,
    __DEV__ ? `relisten-mobile-${platform}-dev` : `relisten-mobile-${platform}`
  );
  const redirectUri =
    __DEV__ || platform === 'ios'
      ? `net.relisten.mobile:/oauth2redirect/${platform}`
      : `https://relisten.net/auth/mobile/${platform}/callback`;

  assertSecureOrigin(issuer, 'Relisten auth issuer');
  assertSecureOrigin(accountsOrigin, 'Relisten accounts origin');

  return {
    issuer,
    accountsOrigin,
    clientId,
    redirectUri,
    useUniversalLinkCallback: false,
  };
}
