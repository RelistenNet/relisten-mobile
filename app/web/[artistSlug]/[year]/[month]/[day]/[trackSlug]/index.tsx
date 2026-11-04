import { useRelistenApi } from '@/relisten/api/context';
import { decodeV4UuidCatalogId, encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import { WebRewriteLoader } from '@/relisten/components/web_rewrite_loader';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { AutoplayDeepLinkToTrackSetting } from '@/relisten/realm/models/user_settings';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { groupByUuid } from '@/relisten/util/group_by';
import { log } from '@/relisten/util/logging';
import { PushShowOptions, usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

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

    (async () => {
      const artist = artistsResults.data.find((candidate) => candidate.slug === String(artistSlug));
      if (!artist) {
        router.replace('/relisten/tabs');
        return;
      }

      const show = await apiClient.showWithSourcesOnDate(artist.uuid, `${year}-${month}-${day}`);

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
      let requestedSourceId = sourceId ? String(sourceId) : undefined;

      if (requestedSourceId && /^\d+$/.test(requestedSourceId)) {
        const resolved = await apiClient.resolveCatalogReferences([
          {
            kind: 'source',
            scheme: 'legacy_integer',
            id: requestedSourceId,
            artist_id: encodeV4UuidCatalogId(artist.uuid, 'artist'),
          },
        ]);
        requestedSourceId = resolved.data?.references[0]?.target?.id;
      }

      for (const source of showData.sources) {
        const uuid = decodeV4UuidCatalogId(source.id, 'source');
        if (source.id !== requestedSourceId && uuid !== requestedSourceId) {
          continue;
        }

        sourceUuid = uuid;

        for (const set of source.sets) {
          for (const track of set.tracks) {
            if (track.slug === trackSlug) {
              trackUuid = decodeV4UuidCatalogId(track.id, 'track');
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

      setTimeout(() => {
        const params: PushShowOptions = {
          artist: artistByUuid[decodeV4UuidCatalogId(showData.artist_id, 'artist')],
          showUuid: decodeV4UuidCatalogId(showData.id, 'show'),
          sourceUuid: sourceUuid,
          overrideGroupSegment: '(artists)',
        };

        if (autoplay && trackUuid) {
          params.playTrackUuid = trackUuid;
        }

        router.push({ pathname: '/relisten/tabs' });

        setTimeout(() => {
          pushShow(params);
        }, 0);
      }, 0);
    })();
  }, [artistSlug, year, month, day, artistsResults.data]);

  return <WebRewriteLoader />;
}
