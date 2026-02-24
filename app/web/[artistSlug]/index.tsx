import { useLocalSearchParams, useRouter } from 'expo-router';
import { useArtistBySlug } from '@/relisten/realm/models/artist_repo';
import { log } from '@/relisten/util/logging';
import { WebRewriteLoader } from '@/relisten/components/web_rewrite_loader';
import { useEffect } from 'react';

const logger = log.extend('deep-links');

export default function Page() {
  const { artistSlug } = useLocalSearchParams();
  const router = useRouter();

  const artist = useArtistBySlug(String(artistSlug));

  useEffect(() => {
    if (artist.data !== null) {
      const newPath = '/relisten/tabs/(artists)/[artistUuid]/';
      const params = { artistUuid: artist.data?.uuid };
      logger.info(`redirecting to ${newPath} ${JSON.stringify(params)}`);

      const timeoutIds: ReturnType<typeof setTimeout>[] = [];

      timeoutIds.push(
        setTimeout(() => {
          router.push({ pathname: '/relisten/tabs' });

          timeoutIds.push(
            setTimeout(() => {
              router.push({ pathname: newPath, params });
            }, 0)
          );
        }, 0)
      );

      return () => {
        timeoutIds.forEach(clearTimeout);
      };
    }
  }, [artist.data]);

  return <WebRewriteLoader />;
}
