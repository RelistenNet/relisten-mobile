import { useLocalSearchParams, useRouter } from 'expo-router';
import { log } from '@/relisten/util/logging';
import { WebRewriteLoader } from '@/relisten/components/web_rewrite_loader';
import { useEffect } from 'react';
import { useRelistenApi } from '@/relisten/api/context';
import { assert } from 'realm/dist/assert';

const logger = log.extend('deep-links');

export default function Page() {
  const { artistSlug, year, month, day, trackSlug, source: sourceId } = useLocalSearchParams();
  const router = useRouter();
  const { apiClient } = useRelistenApi();

  useEffect(() => {
    (async () => {
      const show = await apiClient.showWithSourcesOnDate(
        String(artistSlug),
        `${year}-${month}-${day}`,
        {
          bypassRequestDeduplication: true,
          bypassRateLimit: true,
          bypassEtagCaching: true,
        }
      );

      const showData = show.data;

      if (!showData) {
        logger.error(`Did not find a show matching ${year}-${month}-${day} for ${artistSlug}`);

        setTimeout(() => {
          router.push({ pathname: '/relisten/tabs' });
        }, 0);

        return;
      }

      let sourceUuid: string | undefined = undefined;
      let trackUuid: string | undefined = undefined;

      for (const source of showData.sources) {
        if (String(source.id) !== sourceId) {
          continue;
        }

        sourceUuid = source.uuid;

        for (const set of source.sets) {
          for (const track of set.tracks) {
            if (track.slug === trackSlug) {
              trackUuid = track.uuid;
            }
          }
        }
      }

      if (sourceUuid === undefined && sourceId) {
        logger.error(`Did not find a source matching ${sourceId}`);
      }

      if (trackUuid === undefined && trackSlug) {
        logger.error(`Did not find a track matching ${trackSlug}`);
      }

      setTimeout(() => {
        const newPath =
          '/relisten/tabs/(artists)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/';
        const params = {
          artistUuid: showData.artist_uuid,
          showUuid: showData.uuid,
          sourceUuid: sourceUuid || 'initial',
          playTrackUuid: trackUuid,
        };

        logger.info(`redirecting to ${newPath} ${JSON.stringify(params)}`);

        router.push({ pathname: '/relisten/tabs' });

        setTimeout(() => {
          router.push({
            pathname: newPath,
            params,
          });
        }, 0);
      }, 0);
    })();
  }, [artistSlug, year, month, day]);

  return <WebRewriteLoader />;
}
