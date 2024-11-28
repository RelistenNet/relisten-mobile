import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { Show as ApiShow } from '@/relisten/api/models/show';
import { Show } from '@/relisten/realm/models/show';
import { ShowsWithVenueNetworkBackedBehavior } from '@/relisten/realm/models/shows/show_with_venues_behavior';
import * as R from 'remeda';

import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { useQuery } from '@/relisten/realm/schema';
import { useEffect, useMemo, useState } from 'react';
import Realm from 'realm';
import { showRepo } from '../show_repo';
import { venueRepo } from '../venue_repo';
import { Venue } from '../venue';
import { EventEmitter } from 'expo-modules-core';

class TodayShowsNetworkBackedBehavior extends ShowsWithVenueNetworkBackedBehavior {
  private emitter = new EventEmitter({} as any);

  constructor(
    public artistUuid?: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(artistUuid, options);
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<ApiShow[] | undefined>> {
    return api.todayShows(this.artistUuid, {
      bypassRateLimit: true,
      bypassEtagCaching: true,
    });
  }

  useFetchFromLocal(): Realm.Results<Show> {
    const [showUuids, setState] = useState<string[]>([]);

    useEffect(() => {
      const onChange = (data: string[]) => setState(data);
      const sub = this.emitter.addListener('onChange', onChange);
      return () => this.emitter.removeSubscription(sub);
    }, []);

    return useQuery(
      Show,
      (query) =>
        this.artistUuid
          ? query.filtered('uuid in $0', showUuids).filtered('artistUuid == $0', this.artistUuid)
          : query.filtered('uuid in $0', showUuids),
      [this.artistUuid, showUuids]
    );
  }

  override upsert(realm: Realm, localData: Realm.Results<Show>, apiData: ApiShow[]): void {
    const apiVenuesByUuid = R.fromEntries(
      R.flatMap(
        apiData.filter((s) => !!s.venue),

        (s) => [[s.venue!.uuid, s.venue!]]
      )
    );

    // this.showUuids = apiData.map((x) => x.uuid);
    this.emitter.emit(
      'onChange',
      apiData.map((x) => x.uuid)
    );

    realm.write(() => {
      const { createdModels: createdShows } = showRepo.upsertMultiple(
        realm,
        apiData,
        localData,
        false
      );

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
          } else if (apiVenue) {
            venueRepo.upsert(realm, apiVenue, show.venue);
          }
        }
      }
    });
  }
}

export const useTodayShows = (artistUuid?: string) => {
  const behavior = useMemo(() => {
    return new TodayShowsNetworkBackedBehavior(artistUuid, {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkAlwaysFirst,
    });
  }, [artistUuid]);

  return useNetworkBackedBehavior(behavior);
};
