import Realm from 'realm';
import { Show } from '@/relisten/realm/models/show';
import { Show as ApiShow } from '@/relisten/api/models/show';
import { showRepo } from '@/relisten/realm/models/show_repo';
import { venueRepo } from '@/relisten/realm/models/venue_repo';
import { tourRepo } from '@/relisten/realm/models/tour_repo';
import { groupByUuid } from '@/relisten/util/group_by';
import { artistRepo } from '@/relisten/realm/models/artist_repo';
import { RelistenApiUpdatableObject, Repository } from '@/relisten/realm/repository';
import { RelistenObjectRequiredProperties } from '@/relisten/realm/relisten_object';
import { log } from '@/relisten/util/logging';

const logger = log.extend('repo-utils');

function upsertShowRelationship<
  TModel extends RequiredProperties & RequiredRelationships,
  TApi extends RelistenApiUpdatableObject,
  RequiredProperties extends RelistenObjectRequiredProperties,
  RequiredRelationships extends object,
>(
  realm: Realm,
  api: ReadonlyArray<TApi | null | undefined>,
  apiUuids: ReadonlyArray<string>,
  repo: Repository<TModel, TApi, RequiredProperties, RequiredRelationships>,
  shows: ReadonlyArray<Show>,
  applyToShow: (show: Show, createdObjectsById: Record<string, TModel>) => void
) {
  const uniqueApiUuids = [...new Set(apiUuids)];
  const localValues = [...repo.forUuids(realm, uniqueApiUuids)];

  const { createdModels: createdValues } = repo.upsertMultiple(
    realm,
    api.filter((v) => v !== null && v !== undefined) as TApi[],
    localValues,
    /* performDeletes= */ false
  );

  const valuesByUuid = { ...groupByUuid(localValues), ...groupByUuid(createdValues) };

  for (const show of shows) {
    applyToShow(show, valuesByUuid);
  }
}

export function upsertShowList(
  realm: Realm,
  apiShows: ApiShow[],
  localShows: Realm.Results<Show>,
  {
    performDeletes,
    queryForModel,
    upsertModels,
  }: {
    performDeletes: boolean;
    queryForModel: boolean;
    upsertModels?: {
      tours?: boolean;
      venues?: boolean;
    };
  }
) {
  upsertModels ||= {};
  upsertModels = { tours: true, venues: true, ...upsertModels };

  const { createdModels: createdShows } = showRepo.upsertMultiple(
    realm,
    apiShows,
    localShows,
    performDeletes,
    queryForModel
  );

  const allShows = createdShows.concat(localShows);

  const showsThatNeedsArtists = allShows.filter((s) => !s.artist);

  if (showsThatNeedsArtists.length > 0) {
    const showArtistUuids = new Set(showsThatNeedsArtists.map((s) => s.artistUuid));
    const artistsByUuid = groupByUuid([...artistRepo.forUuids(realm, [...showArtistUuids])]);

    for (const show of showsThatNeedsArtists) {
      show.artist = artistsByUuid[show.artistUuid];
    }
  }

  if (upsertModels.tours) {
    upsertShowRelationship(
      realm,
      apiShows.map((s) => s.tour),
      apiShows.map((s) => s.tour_uuid).filter((s) => !!s) as string[],
      tourRepo,
      allShows,
      (show, toursByUuid) => {
        if (show.tourUuid && !show.tour) {
          show.tour = toursByUuid[show.tourUuid];
        }
      }
    );
  }

  if (upsertModels.venues) {
    upsertShowRelationship(
      realm,
      apiShows.map((s) => s.venue),
      apiShows.map((s) => s.venue_uuid).filter((s) => !!s) as string[],
      venueRepo,
      allShows,
      (show, venuesByUuid) => {
        if (show.venueUuid && !show.venue) {
          show.venue = venuesByUuid[show.venueUuid];
        }
      }
    );
  }
}
