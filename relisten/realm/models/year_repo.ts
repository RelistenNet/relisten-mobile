import { Repository } from '../repository';
import { useQuery, useRealm } from '../schema';
import { Year } from './year';

import { useIsOfflineTab } from '@/relisten/util/routes';
import { useMemo } from 'react';
import Realm from 'realm';
import { RelistenApiClient, RelistenApiResponse } from '../../api/client';
import { YearWithShows } from '../../api/models/year';
import { NetworkBackedBehaviorOptions } from '../network_backed_behavior';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../network_backed_results';
import { filterForUser, useRealmTabsFilter, UserFilters } from '../realm_filters';
import { useArtist } from './artist_repo';
import { Show } from './show';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';
import {
  CombinedValueStream,
  RealmObjectValueStream,
  RealmQueryValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { NetworkBackedModelArrayBehavior } from '@/relisten/realm/network_backed_model_array_behavior';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';

export const yearRepo = new Repository(Year);

export function useYears(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();

  const behavior = useMemo(() => {
    return new NetworkBackedModelArrayBehavior(
      realm,
      yearRepo,
      (realm) => realm.objects(Year).filtered('artistUuid == $0', artistUuid),
      (api) => api.years(artistUuid),
      options
    );
  }, [realm, artistUuid, options]);

  return useNetworkBackedBehavior(behavior);
}

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
    public realm: Realm.Realm,
    public artistUuid: string,
    public yearUuid: string,
    private userFilters: UserFilters,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<YearWithShows>> {
    return api.year(this.artistUuid, this.yearUuid, api.refreshOptions(forcedRefresh));
  }

  override createLocalUpdatingResults(): ValueStream<YearShows> {
    const yearResults = new RealmObjectValueStream(this.realm, Year, this.yearUuid);
    const showsResults = new RealmQueryValueStream<Show>(
      this.realm,
      filterForUser(
        this.realm.objects(Show).filtered('yearUuid == $0', this.yearUuid),
        this.userFilters
      )
    );

    return new CombinedValueStream(yearResults, showsResults, (year, shows) => {
      return { year, shows };
    });
  }

  isLocalDataShowable(localData: YearShows): boolean {
    return localData.year !== null && localData.shows.length > 0;
  }

  override upsert(localData: YearShows, apiData: YearWithShows): void {
    if (!localData.shows.isValid()) {
      return;
    }

    this.realm.write(() => {
      upsertShowList(this.realm, apiData.shows, localData.shows, {
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
  const realm = useRealm();
  const isOfflineTab = useIsOfflineTab();

  const behavior = useMemo(() => {
    return new YearShowsNetworkBackedBehavior(realm, artistUuid, yearUuid, {
      isPlayableOffline: isOfflineTab ? true : null,
    });
  }, [realm, artistUuid, yearUuid, isOfflineTab]);

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
