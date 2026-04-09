import Realm from 'realm';
import { Show } from '@/relisten/realm/models/show';
import { Show as ApiShow } from '@/relisten/api/models/show';
import { showRepo } from '@/relisten/realm/models/show_repo';
import { venueRepo } from '@/relisten/realm/models/venue_repo';
import { tourRepo } from '@/relisten/realm/models/tour_repo';
import { groupByUuid } from '@/relisten/util/group_by';
import { RelistenApiUpdatableObject, Repository } from '@/relisten/realm/repository';
import { RelistenObjectRequiredProperties } from '@/relisten/realm/relisten_object';
import { log } from '@/relisten/util/logging';
import { Song } from '@/relisten/realm/models/song';
import { attachShowArtists } from '@/relisten/realm/models/show_artist_relationships';

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
      song?: Song;
    };
  }
) {
  upsertModels ||= {};
  upsertModels = { tours: true, venues: true, ...upsertModels };

  const { createdModels: createdShows, allModels: allShows } = showRepo.upsertMultiple(
    realm,
    apiShows,
    localShows,
    performDeletes,
    queryForModel
  );

  attachShowArtists(realm, allShows);

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
      apiShows.map((show) => show.venue),
      apiShows.map((show) => show.venue_uuid).filter((uuid) => !!uuid) as string[],
      venueRepo,
      allShows,
      (show, venuesByUuid) => {
        if (show.venueUuid && (!show.venue || show.venue.uuid !== show.venueUuid)) {
          show.venue = venuesByUuid[show.venueUuid];
        }
      }
    );
  }

  const song = upsertModels.song;
  if (song) {
    const writeHandler = () => {
      logger.info(
        `updating song shows allShows=${allShows.length}; apiShows=${apiShows.length}; createdShows=${createdShows.length}; localShows=${localShows.length}`
      );
      for (const show of allShows) {
        song.shows.add(show);
      }
    };

    if (realm.isInTransaction) {
      writeHandler();
    } else {
      realm.write(writeHandler);
    }
  }
}
