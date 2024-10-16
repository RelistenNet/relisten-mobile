import {
  NetworkBackedBehaviorOptions,
  ThrottledNetworkBackedBehavior,
} from '@/relisten/realm/network_backed_behavior';
import Realm from 'realm';
import { Show } from '@/relisten/realm/models/show';
import { Show as ApiShow } from '@/relisten/api/models/show';
import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import * as R from 'remeda';
import { showRepo } from '@/relisten/realm/models/show_repo';
import { Venue } from '@/relisten/realm/models/venue';
import { venueRepo } from '@/relisten/realm/models/venue_repo';

export abstract class ShowsWithVenueNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  Realm.Results<Show>,
  ApiShow[]
> {
  constructor(
    public artistUuid?: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(options);
  }

  abstract fetchFromApi(
    api: RelistenApiClient
  ): Promise<RelistenApiResponse<ApiShow[] | undefined>>;

  abstract useFetchFromLocal(): Realm.Results<Show>;

  isLocalDataShowable(localData: Realm.Results<Show>): boolean {
    return localData.length > 0;
  }

  upsert(realm: Realm, localData: Realm.Results<Show>, apiData: ApiShow[]): void {
    const apiVenuesByUuid = R.fromEntries(R.flatMap(
      apiData.filter((s) => !!s.venue),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (s) => [[s.venue!.uuid, s.venue!]]
    ));

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
