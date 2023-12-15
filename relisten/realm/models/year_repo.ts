import { Repository } from '../repository';
import { useObject, useQuery } from '../schema';
import { Year } from './year';

import {
  createNetworkBackedModelArrayHook,
  useNetworkBackedBehavior,
} from '../network_backed_behavior_hooks';
import { useArtist } from './artist_repo';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../network_backed_results';
import { useMemo } from 'react';
import Realm from 'realm';
import { Show } from './show';
import { ThrottledNetworkBackedBehavior } from '../network_backed_behavior';
import { YearWithShows } from '../../api/models/year';
import { RelistenApiClient, RelistenApiResponse } from '../../api/client';
import { showRepo } from './show_repo';
import * as R from 'remeda';
import { venueRepo } from './venue_repo';
import { Venue } from './venue';

export const yearRepo = new Repository(Year);

export const useYears = (artistUuid: string) => {
  return createNetworkBackedModelArrayHook(
    yearRepo,
    () => {
      const artistQuery = useQuery(
        Year,
        (query) => query.filtered('artistUuid == $0', artistUuid),
        [artistUuid]
      );

      return artistQuery;
    },
    (api) => api.years(artistUuid)
  )();
};

export const useArtistYears = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid, { onlyFetchFromApiIfLocalIsNotShowable: true });
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
    public yearUuid: string
  ) {
    super();
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<YearWithShows>> {
    return api.year(this.artistUuid, this.yearUuid);
  }

  fetchFromLocal(): YearShows {
    const year = useObject(Year, this.yearUuid) || null;
    const shows = useQuery(Show, (query) => query.filtered('yearUuid == $0', this.yearUuid), [
      this.yearUuid,
    ]);

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

    const apiVenuesByUuid = R.flatMapToObj(
      apiData.shows.filter((s) => !!s.venue),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (s) => [[s.venue!.uuid, s.venue!]]
    );

    realm.write(() => {
      const { createdModels: createdShows } = showRepo.upsertMultiple(
        realm,
        apiData.shows,
        localData.shows
      );

      for (const show of createdShows.concat(localData.shows)) {
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
  const artistResults = useArtist(artistUuid, { onlyFetchFromApiIfLocalIsNotShowable: true });
  const yearShowsResults = useYearShows(artistUuid, yearUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      yearShows: yearShowsResults,
      artist: artistResults,
    });
  }, [yearShowsResults, artistResults]);

  return results;
};
