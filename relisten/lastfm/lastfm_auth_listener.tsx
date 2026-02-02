import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { AppState } from 'react-native';
import { useRealm } from '@/relisten/realm/schema';
import { LastFmAuth } from '@/relisten/lastfm/lastfm_auth';
import { log } from '@/relisten/util/logging';

const logger = log.extend('lastfm-auth-listener');

export function LastFmAuthListener() {
  const realm = useRealm();

  useEffect(() => {
    if (!realm) {
      return;
    }

    let isActive = true;

    const handleUrl = async (url: string) => {
      if (!LastFmAuth.isCallbackUrl(url)) {
        return;
      }

      try {
        await LastFmAuth.finishAuth(realm);
      } catch (error) {
        logger.warn('Failed to finish Last.fm auth', error);
      }
    };

    const maybeFinishPendingAuth = async () => {
      if (!isActive) {
        return;
      }

      try {
        const hasPending = await LastFmAuth.hasPendingAuth();

        if (!hasPending) {
          return;
        }

        await LastFmAuth.finishAuth(realm);
      } catch (error) {
        logger.warn('Failed to resume pending Last.fm auth', error);
      }
    };

    const resumePendingAuthWithDelay = (delayMs: number) => {
      const timeoutId = setTimeout(() => {
        if (!isActive) {
          return;
        }

        maybeFinishPendingAuth();
      }, delayMs);

      return () => clearTimeout(timeoutId);
    };

    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        handleUrl(initialUrl);
        return;
      }

      maybeFinishPendingAuth();
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        Linking.getInitialURL().then((initialUrl) => {
          if (initialUrl) {
            handleUrl(initialUrl);
            return;
          }

          const clearShortDelay = resumePendingAuthWithDelay(250);
          const clearLongDelay = resumePendingAuthWithDelay(1250);

          if (!isActive) {
            clearShortDelay();
            clearLongDelay();
          }
        });
      }
    });

    maybeFinishPendingAuth();

    return () => {
      isActive = false;
      subscription.remove();
      appStateSubscription.remove();
    };
  }, [realm]);

  return <></>;
}
