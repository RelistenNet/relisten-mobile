import Realm from 'realm';
import { Show } from '@/relisten/realm/models/show';
import { Show as ApiShow } from '@/relisten/api/models/show';
import { VenueWithShowCounts as ApiVenue } from '@/relisten/api/models/venue';
import * as R from 'remeda';
import { showRepo } from '@/relisten/realm/models/show_repo';
import { Venue } from '@/relisten/realm/models/venue';
import { venueRepo } from '@/relisten/realm/models/venue_repo';

export function upsertShowList(
  realm: Realm,
  localShows: Realm.Results<Show>,
  apiShows: ApiShow[],
  performDeletes: boolean,
  queryForModel: boolean
) {
  const apiVenuesByUuid = R.fromEntries(
    R.flatMap(
      apiShows.filter((s) => !!s.venue),

      (s) => [[s.venue!.uuid, s.venue!]]
    )
  );

  const { createdModels: createdShows } = showRepo.upsertMultiple(
    realm,
    apiShows,
    localShows,
    performDeletes,
    queryForModel
  );

  const allShows = createdShows.concat(localShows);

  for (const show of allShows) {
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
}
