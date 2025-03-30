import { Repository } from '../repository';
import { useObject, useQuery } from '../schema';
import { Year } from './year';

import { useIsOfflineTab } from '@/relisten/util/routes';
import { useMemo } from 'react';
import Realm from 'realm';
import * as R from 'remeda';
import { RelistenApiClient, RelistenApiResponse } from '../../api/client';
import { YearWithShows } from '../../api/models/year';
import { Show as ApiShow } from '../../api/models/show';
import {
  NetworkBackedBehaviorOptions,
  ThrottledNetworkBackedBehavior,
} from '../network_backed_behavior';
import {
  createNetworkBackedModelArrayHook,
  useNetworkBackedBehavior,
} from '../network_backed_behavior_hooks';
import { NetworkBackedResults, mergeNetworkBackedResults } from '../network_backed_results';
import { useRealmTabsFilter } from '../realm_filters';
import { useArtist } from './artist_repo';
import { Show } from './show';
import { showRepo } from './show_repo';
import { Venue } from './venue';
import { venueRepo } from './venue_repo';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';

export const yearRepo = new Repository(Year);

export const useYears = (artistUuid: string) => {
  return createNetworkBackedModelArrayHook(
    yearRepo,
    () => {
      const artistQuery = useRealmTabsFilter(
        useQuery(Year, (query) => query.filtered('artistUuid == $0', artistUuid), [artistUuid])
      );

      return artistQuery;
    },
    (api) => api.years(artistUuid)
  )();
};

export const useArtistYears = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid);
  const yearsResults = useYears(artistUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      years: yearsResults,
      artist: artistResults,
    });
  }, [yearsResults, artistResults]);

  return results;
};

export interface YearShows {
  year: Year | null;
  shows: Realm.Results<Show>;
}

class YearShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  YearShows,
  YearWithShows
> {
  constructor(
    public artistUuid: string,
    public yearUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<YearWithShows>> {
    return api.year(this.artistUuid, this.yearUuid, api.refreshOptions(forcedRefresh));
  }

  useFetchFromLocal(): YearShows {
    const year = useObject(Year, this.yearUuid) || null;
    const shows = useRealmTabsFilter(
      useQuery(Show, (query) => query.filtered('yearUuid == $0', this.yearUuid), [this.yearUuid])
    );

    const obj = useMemo(() => {
      return { year, shows };
    }, [year, shows]);

    return obj;
  }

  isLocalDataShowable(localData: YearShows): boolean {
    return localData.year !== null && localData.shows.length > 0;
  }

  upsert(realm: Realm, localData: YearShows, apiData: YearWithShows): void {
    if (!localData.shows.isValid()) {
      return;
    }

    realm.write(() => {
      upsertShowList(realm, apiData.shows, localData.shows, {
        // we may not have all the shows here on initial load
        performDeletes: false,
        queryForModel: true, // we know this list of shows is authoritative
      });
    });
  }
}

export function useYearShows(
  artistUuid: string,
  yearUuid: string
): NetworkBackedResults<YearShows> {
  const behavior = useMemo(() => {
    return new YearShowsNetworkBackedBehavior(artistUuid, yearUuid);
  }, [artistUuid, yearUuid]);

  return useNetworkBackedBehavior(behavior);
}

export const useArtistYearShows = (artistUuid: string, yearUuid: string) => {
  const artistResults = useArtist(artistUuid);
  const yearShowsResults = useYearShows(artistUuid, yearUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      yearShows: yearShowsResults,
      artist: artistResults,
    });
  }, [yearShowsResults, artistResults]);

  return results;
};

export const useYearMetadata = (year?: Year | null) => {
  const isOfflineTab = useIsOfflineTab();
  const shows = useRealmTabsFilter(useQuery(Show).filtered('yearUuid = $0', year?.uuid));

  if (!year) {
    return { shows: undefined, sources: undefined };
  }

  if (isOfflineTab) {
    const sources = shows.reduce((memo, next) => next.sourceCount + memo, 0);

    return { shows: shows.length, sources };
  }

  return { shows: year.showCount, sources: year.sourceCount };
};
