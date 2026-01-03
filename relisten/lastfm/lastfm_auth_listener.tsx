import { useEffect } from 'react';
import * as Linking from 'expo-linking';
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

    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        handleUrl(initialUrl);
      }
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [realm]);

  return <></>;
}
