import { useLocalSearchParams, useRouter } from 'expo-router';
import { log } from '@/relisten/util/logging';
import { WebRewriteLoader } from '@/relisten/components/web_rewrite_loader';
import { useEffect } from 'react';
import { useRelistenApi } from '@/relisten/api/context';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { AutoplayDeepLinkToTrackSetting } from '@/relisten/realm/models/user_settings';
import { PushShowOptions, usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { groupByUuid } from '@/relisten/util/group_by';

const logger = log.extend('deep-links');

export default function Page() {
  const { artistSlug, year, month, day, trackSlug, source: sourceId } = useLocalSearchParams();
  const router = useRouter();
  const { apiClient } = useRelistenApi();
  const userSettings = useUserSettings();
  const { pushShow } = usePushShowRespectingUserSettings();
  const artistsResults = useArtists();

  useEffect(() => {
    if (artistsResults.data.length === 0) {
      return;
    }

    let cancelled = false;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

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

      if (cancelled) return;

      const showData = show.data;

      if (!showData) {
        logger.error(`Did not find a show matching ${year}-${month}-${day} for ${artistSlug}`);

        timeoutIds.push(
          setTimeout(() => {
            if (!cancelled) router.push({ pathname: '/relisten/tabs' });
          }, 0)
        );

        return;
      }

      let sourceUuid: string | undefined = undefined;
      let trackUuid: string | undefined = undefined;

      for (const source of showData.sources) {
        if (String(source.id) !== sourceId && source.uuid !== sourceId) {
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

      const autoplay =
        userSettings.autoplayDeepLinkToTrackWithDefault() ===
        AutoplayDeepLinkToTrackSetting.PlayTrack;

      const artistByUuid = groupByUuid([...artistsResults.data]);

      timeoutIds.push(
        setTimeout(() => {
          if (cancelled) return;

          const params: PushShowOptions = {
            artist: artistByUuid[showData.artist_uuid],
            showUuid: showData.uuid,
            sourceUuid: sourceUuid,
            overrideGroupSegment: '(artists)',
          };

          if (autoplay && trackUuid) {
            params.playTrackUuid = trackUuid;
          }

          router.push({ pathname: '/relisten/tabs' });

          timeoutIds.push(
            setTimeout(() => {
              if (!cancelled) pushShow(params);
            }, 0)
          );
        }, 0)
      );
    })();

    return () => {
      cancelled = true;
      timeoutIds.forEach(clearTimeout);
    };
  }, [artistSlug, year, month, day, artistsResults.data]);

  return <WebRewriteLoader />;
}
