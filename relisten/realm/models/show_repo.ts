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
import { NetworkBackedBehaviorOptions } from '../network_backed_behavior';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { Show } from './show';
import { Source } from './source';
import { venueRepo } from './venue_repo';
import { Artist } from './artist';
import { Year } from './year';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import { useRealm } from '@/relisten/realm/schema';
import {
  CombinedValueStream,
  RealmObjectValueStream,
  RealmQueryValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';

export const showRepo = new Repository(Show);

export interface ShowWithSources {
  show: Show | undefined;
  sources: Realm.Results<Source>;
}

// const getEtreeId = (s = '') =>
//   Number(
//     s
//       .split('.')
//       .reverse()
//       .find((x) => /^[0-9]+$/.test(x))
//   );

// our magic live music sort, taken from relisten-web
// gives precedence to favorites -> soundboards -> charlie miller/peter costello -> etree ids -> avg weighted rating
// https://github.com/RelistenNet/relisten-web/blob/69e05607c0a0699b5ccb0b3711a3ec17faf3a855/src/redux/modules/tapes.js#L63
export const sortSources = (sources: Realm.Results<Source>) => {
  const sortedSources = sources
    ? Array.from(sources).sort(
        firstBy(
          // sort first if favorited or downloaded
          (t: Source) =>
            t.isFavorite || t.allSourceTracks().some((tr) => tr?.offlineInfo?.isPlayableOffline()),
          'desc'
        )
          .thenBy((t: Source) => t.isSoundboard, 'desc')
          // Charlie for GD, Pete for JRAD
          .thenBy(
            (t: Source) =>
              /(charlie miller)|(peter costello)/i.test(
                [t.taper, t.transferrer, t.source].join('')
              ),
            'desc'
          )
          // .thenBy(
          //   (t1: Source, t2: Source) =>
          //     getEtreeId(t1.upstreamIdentifier) - getEtreeId(t2.upstreamIdentifier),
          //   'desc'
          // )
          .thenBy((t) => t.avgRatingWeighted, 'desc')
      )
    : [];

  return sortedSources;
};

export class ShowWithFullSourcesNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  ShowWithSources,
  ApiShowWithSources
> {
  constructor(
    realm: Realm.Realm,
    public showUuid?: string,
    public sourceUuid?: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<ApiShowWithSources | undefined>> {
    if (!this.showUuid) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    return api.showWithSources(this.showUuid, api.refreshOptions(forcedRefresh));
  }

  override createLocalUpdatingResults(): ValueStream<ShowWithSources> {
    if (this.sourceUuid !== undefined && this.showUuid === undefined) {
      const source = this.realm.objectForPrimaryKey(Source, this.sourceUuid);

      if (source) {
        this.showUuid = source.showUuid;
      }
    }

    const showUuid = this.showUuid || '__no_show_sentinel__';

    const showResults = new RealmObjectValueStream(this.realm, Show, showUuid);
    const sourcesResults = new RealmQueryValueStream<Source>(
      this.realm,
      this.realm.objects(Source).filtered('showUuid == $0', showUuid)
    );

    return new CombinedValueStream(showResults, sourcesResults, (show, sources) => {
      return { show: show || undefined, sources } as ShowWithSources;
    });
  }

  isLocalDataShowable(localData: ShowWithSources): boolean {
    return localData.show !== null && localData.sources.length > 0;
  }

  override upsert(localData: ShowWithSources, apiData: ApiShowWithSources): void {
    const artist = this.realm.objectForPrimaryKey(Artist, apiData.artist_uuid);
    const year = this.realm.objectForPrimaryKey(Year, apiData.year_uuid);
    const apiSourceSets = R.flatMap(apiData.sources, (s) => s.sets);
    const apiSourceTracks = R.flatMap(apiSourceSets, (s) => s.tracks);
    const apiSourceSetsBySource = R.groupBy(apiSourceSets, (s) => s.source_uuid);
    const apiSourceTracksBySet = R.groupBy(apiSourceTracks, (s) => s.source_set_uuid);

    this.realm.write(() => {
      // TODO: maybe should be inside if statement?
      // it broke doing that, but worth reivisiting
      const {
        createdModels: [createdShow],
        updatedModels: [updatedShow],
      } = showRepo.upsert(this.realm, apiData, localData.show);

      if (createdShow) {
        createdShow.artist = artist!;
      }

      if (!localData.show) {
        localData.show = updatedShow || createdShow;
      }

      if (localData.show && apiData.venue) {
        let venueToUpdate = localData.show.venue;

        if (venueToUpdate && venueToUpdate.uuid !== apiData.venue.uuid) {
          venueToUpdate = undefined;
        }

        const { createdModels: createdVenues, updatedModels: updatedVenues } = venueRepo.upsert(
          this.realm,
          apiData.venue,
          venueToUpdate,
          true
        );

        if (createdVenues.length > 0) {
          localData.show.venue = createdVenues[0];
        }

        if (updatedVenues.length > 0) {
          localData.show.venue = updatedVenues[0];
        }
      }

      const { createdModels: createdSources } = sourceRepo.upsertMultiple(
        this.realm,
        apiData.sources,
        localData.sources
      );

      for (const source of createdSources) {
        source.artist = artist!;
      }

      for (const source of localData.sources) {
        const { createdModels: createdSourceSets } = sourceSetRepo.upsertMultiple(
          this.realm,
          apiSourceSetsBySource[source.uuid] || [],
          source.sourceSets
        );

        source.sourceSets.push(...createdSourceSets);

        for (const sourceSet of source.sourceSets) {
          const { createdModels: createdSourceTracks } = sourceTrackRepo.upsertMultiple(
            this.realm,
            apiSourceTracksBySet[sourceSet.uuid],
            sourceSet.sourceTracks
          );

          sourceSet.sourceTracks.push(...createdSourceTracks);

          createdSourceTracks.forEach((st) => {
            st.artist = artist!;
            st.year = year!;
            st.show = localData.show!;
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
  const realm = useRealm();
  const behavior = useMemo(() => {
    return new ShowWithFullSourcesNetworkBackedBehavior(realm, showUuid);
  }, [realm, showUuid]);

  return useNetworkBackedBehavior(behavior);
}

export function useFullShowWithSelectedSource(showUuid: string, selectedSourceUuid: string) {
  const results = useFullShow(String(showUuid));
  const show = results.data?.show;
  const sources = results.data?.sources;
  const artist = useArtist(show?.artistUuid);

  const sortedSources = useMemo(() => {
    if (!sources) return [];

    return sortSources(sources);
  }, [sources]);

  // default sourceUuid is initial which will just fall back to sortedSources[0]
  const selectedSource =
    sortedSources.find(
      (source) =>
        source.uuid === selectedSourceUuid ||
        // Prioritize favorited sources by default
        (selectedSourceUuid === 'initial' && source.isFavorite)
    ) ?? sortedSources[0];

  return {
    results,
    show: show!,
    sources: sortedSources,
    artist,
    selectedSource,
  };
}
