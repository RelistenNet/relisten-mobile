import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { log } from '@/relisten/util/logging';

const logger = log.extend('apple-revocation');

/**
 * Asks Apple for a fresh authorization code, so the server can revoke
 * Relisten's Apple tokens when it deletes the account.
 *
 * Normal sign-in already redeemed its code through the browser flow, so
 * deletion needs a new one from the native prompt. No name or email is
 * requested: the server only exchanges the code and checks it belongs to the
 * account's Apple identity.
 *
 * Returns null when there is no code to send: off iOS, when Apple
 * authentication is unavailable, or when the listener cancels or Apple fails.
 * Deletion goes ahead without revocation in every one of those cases. The
 * code is a credential, so it is never logged.
 */
export async function requestAppleRevocationCode(): Promise<string | null> {
  if (Platform.OS !== 'ios') {
    return null;
  }

  try {
    if (!(await AppleAuthentication.isAvailableAsync())) {
      return null;
    }

    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    return credential.authorizationCode || null;
  } catch (error) {
    const canceled = (error as { code?: unknown } | null)?.code === 'ERR_REQUEST_CANCELED';
    logger.info(
      canceled
        ? 'Apple reauthorization canceled; deleting without revocation'
        : 'Apple reauthorization failed; deleting without revocation'
    );
    return null;
  }
}
