import { Repository } from '../repository';

import { firstBy } from 'thenby';
import { Show } from './show';
import Realm from 'realm';
import { useMemo } from 'react';
import { RelistenApiClient, RelistenApiResponse, RelistenApiResponseType } from '../../api/client';
import { useObject, useQuery, useRealm } from '../schema';
import { ThrottledNetworkBackedBehavior } from '../network_backed_behavior';
import { ShowWithSources as ApiShowWithSources } from '../../api/models/source';
import { Source } from './source';
import * as R from 'remeda';
import { sourceTrackRepo } from './source_track_repo';
import { sourceSetRepo } from './source_set_repo';
import { sourceRepo } from './source_repo';
import { NetworkBackedResults, mergeNetworkBackedResults } from '../network_backed_results';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { venueRepo } from './venue_repo';
import { Shows } from '@/relisten/api/models/song';
import { Venue } from './venue';
import { useArtist } from './artist_repo';

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
    public sourceUuid?: string
  ) {
    super();
  }

  fetchFromApi(
    api: RelistenApiClient
  ): Promise<RelistenApiResponse<ApiShowWithSources | undefined>> {
    if (!this.showUuid) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    return api.showWithSources(this.showUuid);
  }

  fetchFromLocal(): ShowWithSources {
    const realm = useRealm();

    if (this.sourceUuid !== undefined && this.showUuid === undefined) {
      const source = realm.objectForPrimaryKey(Source, this.sourceUuid);

      if (source) {
        this.showUuid = source.showUuid;
      }
    }

    const showUuid = this.showUuid || '__no_show_sentintel__';

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
        }
      }
    });
  }
}

class RecentShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  Realm.Results<Show>,
  Shows
> {
  constructor(public artistUuid?: string) {
    super();
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<Shows | undefined>> {
    if (!this.artistUuid) {
      return Promise.resolve({ type: RelistenApiResponseType.Offline, data: undefined });
    }

    return api.recentPerformedShows(this.artistUuid);
  }

  fetchFromLocal(): Realm.Results<Show> {
    const topShows = useQuery(
      Show,
      (query) => query.filtered('artistUuid == $0', this.artistUuid),
      [this.artistUuid]
    );

    return topShows;
  }

  isLocalDataShowable(localData: Realm.Results<Show>): boolean {
    return localData.length > 0;
  }

  upsert(realm: Realm, localData: Realm.Results<Show>, apiData: Shows): void {
    if (!localData.isValid()) {
      return;
    }

    const apiVenuesByUuid = R.flatMapToObj(
      apiData.filter((s) => !!s.venue),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (s) => [[s.venue!.uuid, s.venue!]]
    );

    realm.write(() => {
      const { createdModels: createdShows } = showRepo.upsertMultiple(realm, apiData, localData);

      for (const show of createdShows.concat(localData)) {
        if (show.venueUuid) {
          const apiVenue = apiVenuesByUuid[show.venueUuid];

          if (!show.venue) {
            const localVenue = realm.objectForPrimaryKey(Venue, show.venueUuid);

            if (localVenue) {
              show.venue = localVenue;
            } else {
              const { createdModels: createdVenues } = venueRepo.upsert(realm, apiVenue, undefined);

              if (createdVenues.length > 0) {
                show.venue = createdVenues[0];
              }
            }
          } else {
            venueRepo.upsert(realm, apiVenue, show.venue);
          }
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

  return behavior.fetchFromLocal();
}

export const useRecentShows = (artistUuid: string) => {
  const behavior = useMemo(() => {
    return new RecentShowsNetworkBackedBehavior(artistUuid);
  }, [artistUuid]);

  return useNetworkBackedBehavior(behavior);
};

export function useArtistRecentShows(artistUuid: string) {
  const artistResults = useArtist(artistUuid, { onlyFetchFromApiIfLocalIsNotShowable: true });
  const showResults = useRecentShows(artistUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      shows: showResults,
      artist: artistResults,
    });
  }, [showResults, artistResults]);

  return results;
}
