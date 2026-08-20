import { Repository } from '../repository';
import { useQuery, useRealm } from '../schema';
import { Year } from './year';

import { useGroupSegment } from '@/relisten/util/routes';
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
  ActiveCatalogObjectValueStream,
  CombinedValueStream,
  RealmQueryValueStream,
  RetainedCatalogObjectValueStream,
  RetainedCatalogResultsValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { NetworkBackedModelArrayBehavior } from '@/relisten/realm/network_backed_model_array_behavior';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';
import { activeCatalogObjects } from '@/relisten/realm/catalog_retirement';

export const yearRepo = new Repository(Year);

export function yearsNetworkBackedModelArrayBehavior(
  realm: Realm.Realm,
  isOfflineTab: boolean,
  artistUuid: string,
  options?: NetworkBackedBehaviorOptions,
  includeRetiredCatalog: boolean = isOfflineTab
) {
  return new NetworkBackedModelArrayBehavior(
    realm,
    yearRepo,
    (realm) => {
      const catalogYears = includeRetiredCatalog
        ? realm.objects(Year)
        : activeCatalogObjects(realm, Year);
      return filterForUser<Year>(catalogYears.filtered('artistUuid == $0', artistUuid), {
        isFavorite: null,
        isPlayableOffline: isOfflineTab ? true : null,
      });
    },
    (api) => api.years(artistUuid),
    options,
    includeRetiredCatalog ? 'year-list.retained' : undefined
  );
}

export function useYears(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const groupSegment = useGroupSegment();
  const isOfflineTab = groupSegment === '(offline)';
  const includeRetiredCatalog = groupSegment !== '(artists)';

  const behavior = useMemo(() => {
    return yearsNetworkBackedModelArrayBehavior(
      realm,
      isOfflineTab,
      artistUuid,
      options,
      includeRetiredCatalog
    );
  }, [realm, isOfflineTab, artistUuid, options, includeRetiredCatalog]);

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

export class YearShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  YearShows,
  YearWithShows
> {
  constructor(
    public realm: Realm.Realm,
    public artistUuid: string,
    public yearUuid: string,
    private userFilters: UserFilters,
    private includeRetiredCatalog: boolean,
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
    const yearResults = this.includeRetiredCatalog
      ? new RetainedCatalogObjectValueStream(this.realm, Year, this.yearUuid, 'year-detail.root')
      : new ActiveCatalogObjectValueStream(this.realm, Year, this.yearUuid, 'year-detail.root');
    const catalogShows = this.includeRetiredCatalog
      ? this.realm.objects(Show)
      : activeCatalogObjects(this.realm, Show);
    const showsQuery = filterForUser(
      catalogShows.filtered('yearUuid == $0', this.yearUuid),
      this.userFilters
    );
    const showsResults = this.includeRetiredCatalog
      ? new RetainedCatalogResultsValueStream(this.realm, showsQuery, 'year-detail.shows')
      : new RealmQueryValueStream(this.realm, showsQuery);

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
      });
      yearRepo.upsert(this.realm, apiData, localData.year ?? undefined);
    });
  }
}

export function createYearShowsNetworkBackedBehavior(
  realm: Realm.Realm,
  artistUuid: string,
  yearUuid: string,
  userFilters: UserFilters,
  options?: NetworkBackedBehaviorOptions
) {
  const includeRetiredCatalog =
    userFilters.isPlayableOffline === true || userFilters.isFavorite === true;
  return new YearShowsNetworkBackedBehavior(
    realm,
    artistUuid,
    yearUuid,
    userFilters,
    includeRetiredCatalog,
    options
  );
}

export function useYearShows(
  artistUuid: string,
  yearUuid: string
): NetworkBackedResults<YearShows> {
  const realm = useRealm();
  const groupSegment = useGroupSegment();
  const isOfflineTab = groupSegment === '(offline)';
  const includeRetiredCatalog = groupSegment !== '(artists)';

  const behavior = useMemo(() => {
    return new YearShowsNetworkBackedBehavior(
      realm,
      artistUuid,
      yearUuid,
      {
        isPlayableOffline: isOfflineTab ? true : null,
        isFavorite: null,
      },
      includeRetiredCatalog
    );
  }, [realm, artistUuid, yearUuid, isOfflineTab, includeRetiredCatalog]);

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

export const useOfflineYearMetadata = (year?: Year | null) => {
  // Offline metadata intentionally includes retired parents that still own retained downloads.
  const shows = useRealmTabsFilter(
    useQuery(Show, (query) => query.filtered('yearUuid = $0', year?.uuid), [year?.uuid])
  );

  if (!year) {
    return { shows: undefined, sources: undefined };
  }

  const sources = shows.reduce((memo, next) => next.sourceCount + memo, 0);

  return { shows: shows.length, sources };
};
