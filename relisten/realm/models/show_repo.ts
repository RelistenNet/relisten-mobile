import { Repository } from '../repository';
import { useMemo } from 'react';
import Realm from 'realm';
import * as R from 'remeda';
import { sourceTrackRepo } from './source_track_repo';
import { sourceSetRepo } from './source_set_repo';
import { sourceRepo } from './source_repo';
import { NetworkBackedResults } from '../network_backed_results';
import { firstBy } from 'thenby';
import { RelistenApiClient, RelistenApiResponse, RelistenApiResponseType } from '../../api/client';
import { ShowWithSources as ApiShowWithSources } from '../../api/models/source';
import {
  NetworkBackedBehaviorOptions,
  ThrottledNetworkBackedBehavior,
} from '../network_backed_behavior';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { useObject, useQuery, useRealm } from '../schema';
import { Show } from './show';
import { Source } from './source';
import { venueRepo } from './venue_repo';
import { Artist } from './artist';
import { Year } from './year';
import { useArtist } from '@/relisten/realm/models/artist_repo';

export const showRepo = new Repository(Show);

export interface ShowWithSources {
  show: Show | undefined;
  sources: Realm.Results<Source>;
}

const getEtreeId = (s = '') =>
  Number(
    s
      .split('.')
      .reverse()
      .find((x) => /^[0-9]+$/.test(x))
  );

// our magic live music sort, taken from relisten-web
// gives precedence to soundboards -> charlie miller/peter costello -> etree ids -> avg weighted rating
// https://github.com/RelistenNet/relisten-web/blob/69e05607c0a0699b5ccb0b3711a3ec17faf3a855/src/redux/modules/tapes.js#L63
export const sortSources = (sources: Realm.Results<Source>) => {
  const sortedSources = sources
    ? Array.from(sources).sort(
        firstBy((t: Source) => t.isSoundboard, 'desc')
          // Charlie for GD, Pete for JRAD
          .thenBy(
            (t: Source) =>
              /(charlie miller)|(peter costello)/i.test(
                [t.taper, t.transferrer, t.source].join('')
              ),
            'desc'
          )
          .thenBy(
            (t1: Source, t2: Source) =>
              getEtreeId(t1.upstreamIdentifier) - getEtreeId(t2.upstreamIdentifier),
            'desc'
          )
          .thenBy((t) => t.avgRatingWeighted, 'desc')
      )
    : [];

  return sortedSources;
};

class ShowWithFullSourcesNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  ShowWithSources,
  ApiShowWithSources
> {
  constructor(
    public showUuid?: string,
    public sourceUuid?: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(options);
  }

  fetchFromApi(
    api: RelistenApiClient
  ): Promise<RelistenApiResponse<ApiShowWithSources | undefined>> {
    if (!this.showUuid) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    return api.showWithSources(this.showUuid);
  }

  useFetchFromLocal(): ShowWithSources {
    const realm = useRealm();

    if (this.sourceUuid !== undefined && this.showUuid === undefined) {
      const source = realm.objectForPrimaryKey(Source, this.sourceUuid);

      if (source) {
        this.showUuid = source.showUuid;
      }
    }

    const showUuid = this.showUuid || '__no_show_sentinel__';

    const show = useObject(Show, showUuid) || undefined;
    const sources = useQuery(Source, (query) => query.filtered('showUuid == $0', showUuid), [
      showUuid,
    ]);

    const obj = useMemo(() => {
      return {
        show,
        sources,
      };
    }, [show, sources]);

    return obj;
  }

  isLocalDataShowable(localData: ShowWithSources): boolean {
    return localData.show !== null && localData.sources.length > 0;
  }

  upsert(realm: Realm, localData: ShowWithSources, apiData: ApiShowWithSources): void {
    const artist = realm.objectForPrimaryKey(Artist, apiData.artist_uuid);
    const year = realm.objectForPrimaryKey(Year, apiData.year_uuid);
    const apiSourceSets = R.flatMap(apiData.sources, (s) => s.sets);
    const apiSourceTracks = R.flatMap(apiSourceSets, (s) => s.tracks);
    const apiSourceSetsBySource = R.groupBy(apiSourceSets, (s) => s.source_uuid);
    const apiSourceTracksBySet = R.groupBy(apiSourceTracks, (s) => s.source_set_uuid);

    realm.write(() => {
      // TODO: maybe should be inside if statement?
      // it broke doing that, but worth reivisiting
      const {
        createdModels: [createdShow],
        updatedModels: [updatedShow],
      } = showRepo.upsert(realm, apiData, localData.show);

      if (!localData.show) {
        localData.show = updatedShow || createdShow;
      }

      if (localData.show && apiData.venue) {
        const { createdModels: createdVenues, updatedModels: updatedVenues } = venueRepo.upsert(
          realm,
          apiData.venue,
          localData.show.venue,
          true
        );

        if (createdVenues.length > 0) {
          localData.show.venue = createdVenues[0];
        }

        if (updatedVenues.length > 0) {
          localData.show.venue = updatedVenues[0];
        }
      }

      sourceRepo.upsertMultiple(realm, apiData.sources, localData.sources);

      for (const source of localData.sources) {
        const { createdModels: createdSourceSets } = sourceSetRepo.upsertMultiple(
          realm,
          apiSourceSetsBySource[source.uuid] || [],
          source.sourceSets
        );

        source.sourceSets.push(...createdSourceSets);

        for (const sourceSet of source.sourceSets) {
          const { createdModels: createdSourceTracks } = sourceTrackRepo.upsertMultiple(
            realm,
            apiSourceTracksBySet[sourceSet.uuid],
            sourceSet.sourceTracks
          );

          sourceSet.sourceTracks.push(...createdSourceTracks);

          createdSourceTracks.forEach((st) => {
            st.artist = artist || undefined;
            st.year = year || undefined;
            st.show = localData.show;
            st.source = source;
          });
        }
      }
    });
  }
}

export function useFullShow(
  showUuid: string | undefined
): NetworkBackedResults<ShowWithSources | undefined> {
  const behavior = useMemo(() => {
    return new ShowWithFullSourcesNetworkBackedBehavior(showUuid);
  }, [showUuid]);

  return useNetworkBackedBehavior(behavior);
}

export function useFullShowWithSelectedSource(showUuid: string, selectedSourceUuid: string) {
  const results = useFullShow(String(showUuid));
  const show = results?.data?.show;
  const sources = results?.data?.sources;
  const artist = useArtist(show?.artistUuid);

  const sortedSources = useMemo(() => {
    if (!sources) return [];

    return sortSources(sources);
  }, [sources]);

  // default sourceUuid is initial which will just fall back to sortedSources[0]
  const selectedSource =
    sortedSources.find((source) => source.uuid === selectedSourceUuid) ?? sortedSources[0];

  return {
    results,
    show: show!,
    sources,
    artist,
    selectedSource,
  };
}

export function useFullShowFromSource(
  sourceUuid: string | undefined
): NetworkBackedResults<ShowWithSources | undefined> {
  const behavior = useMemo(() => {
    return new ShowWithFullSourcesNetworkBackedBehavior(undefined, sourceUuid);
  }, [sourceUuid]);

  return useNetworkBackedBehavior(behavior);
}

export function useShow(showUuid?: string): ShowWithSources | undefined {
  const behavior = useMemo(() => {
    return new ShowWithFullSourcesNetworkBackedBehavior(showUuid);
  }, [showUuid]);

  return behavior.useFetchFromLocal();
}
