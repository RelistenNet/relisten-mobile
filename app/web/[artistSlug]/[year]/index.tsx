import { useLocalSearchParams, useRouter } from 'expo-router';
import { useArtistBySlug } from '@/relisten/realm/models/artist_repo';
import { log } from '@/relisten/util/logging';
import { WebRewriteLoader } from '@/relisten/components/web_rewrite_loader';
import { useArtistYears } from '@/relisten/realm/models/year_repo';
import { useEffect } from 'react';

const logger = log.extend('deep-links');

export default function Page() {
  const { artistSlug, year: yearSlug } = useLocalSearchParams();
  const router = useRouter();

  const artist = useArtistBySlug(String(artistSlug));
  const years = useArtistYears(artist.data?.uuid || 'invalid');

  useEffect(() => {
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    if (years.data.artist !== null && years.data.years.length > 0) {
      const yearArtist = years.data.artist;
      const filteredYears = years.data.years.filter((y) => y.year === yearSlug);

      if (filteredYears.length > 0) {
        const year = filteredYears[0];

        const newPath = '/relisten/tabs/(artists)/[artistUuid]/year/[yearUuid]/';
        const params = { artistUuid: yearArtist.uuid, yearUuid: year.uuid };
        logger.info(`redirecting to ${newPath} ${JSON.stringify(params)}`);

        timeoutIds.push(
          setTimeout(() => {
            router.push({ pathname: '/relisten/tabs' });

            timeoutIds.push(
              setTimeout(() => {
                router.push({
                  pathname: newPath,
                  params,
                });
              }, 0)
            );
          }, 0)
        );
      } else {
        logger.error(`Did not find a year matching ${yearSlug}`);

        timeoutIds.push(
          setTimeout(() => {
            router.push({ pathname: '/relisten/tabs' });
          }, 0)
        );
      }
    } else {
      logger.warn(`Cannot redirect artist=${years.data.artist}, years=${years.data.years.length}`);
    }

    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  }, [years.data, yearSlug]);

  return <WebRewriteLoader />;
}
