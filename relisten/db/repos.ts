import Artist from './models/artist';
import { Columns, Tables } from './schema';
import {
  createRepoQueryHook,
  createSimpleRepoQueryHook,
  defaultNetworkResultUpsertBehavior,
  upsertNetworkResult,
} from './repo_query_hook';
import { Database, Model, Q } from '@nozbe/watermelondb';
import Year from './models/year';
import Show from './models/show';
import { CopyableFromApi, UpdatableFromApi } from './database';
import { RelistenObject, RelistenUpdatableObject } from '../api/models/relisten';
import * as R from 'remeda';
import { FullArtist } from '../api/models/artist';
import { Clause } from '@nozbe/watermelondb/QueryDescription';
import dayjs from 'dayjs';
import SetlistSong from './models/setlist_song';
import { SetlistSongWithPlayCount } from '../api/models/setlist_song';
import Venue from './models/venue';
import { VenueWithShowCounts } from '../api/models/venue';
import Tour from './models/tour';
import { TourWithShowCount } from '../api/models/tour';
import { WriterInterface } from '@nozbe/watermelondb/Database';

const MIN_TIME_BETWEEN_FULL_ARTIST_API_CALLS_MS = 10 * 60 * 1000;

export const useAllArtistsQuery = createSimpleRepoQueryHook(
  Tables.artists,
  (artists) => artists.query().observe(),
  (apiClient) => apiClient.artists(),
  (artists: Artist[]) => {
    artists.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });

    return artists;
  }
);

async function upsertFullArtistProp<
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject
>(
  database: Database,
  table: string,
  networkResults: TApiModel[],
  writer: WriterInterface,
  ...query: Clause[]
): Promise<TModel[]> {
  console.debug('called upsertFullArtistProp for', table);
  const dbResults = await database
    .get<TModel>(table)
    .query(...query)
    .fetch();
  console.debug('got dbResults', dbResults.length, 'for', table);

  const dbResultsById = R.flatMapToObj(dbResults, (model) => [[model.id, model]]);

  console.debug('calling defaultNetworkResultUpsertBehavior for', table);
  return await upsertNetworkResult(database, table, networkResults, dbResultsById, writer);
}

const lastFullArtistUpsertStartedAt: { [artistId: string]: dayjs.Dayjs } = {};

async function normalizedArtistNetworkResultUpsertBehavior<
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject
>(
  database: Database,
  table: string,
  networkResults: FullArtist,
  // We cannot use this because the payload will return the full list of shows for the artist, but the query might
  // only be the shows for a single year so we need to requery the full list of shows.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dbResultsById: Record<string, TModel>
): Promise<TModel[]> {
  const artistId = networkResults.artist.uuid;

  lastFullArtistUpsertStartedAt[artistId] = dayjs();

  const promises: { [table: string]: Promise<Array<Model & UpdatableFromApi>> } = {};

  return await database.write(async (writer) => {
    promises[Tables.years] = upsertFullArtistProp(
      database,
      Tables.years,
      networkResults.years,
      writer,
      Q.where(Columns.years.artistId, artistId)
    );

    promises[Tables.shows] = upsertFullArtistProp(
      database,
      Tables.shows,
      networkResults.shows,
      writer,
      Q.where(Columns.shows.artistId, artistId)
    );

    if (networkResults.artist.features.tours) {
      promises[Tables.tours] = upsertFullArtistProp<Tour, TourWithShowCount>(
        database,
        Tables.tours,
        networkResults.tours,
        writer,
        Q.where(Columns.tours.artistId, artistId)
      );
    }

    promises[Tables.venues] = upsertFullArtistProp<Venue, VenueWithShowCounts>(
      database,
      Tables.venues,
      networkResults.venues,
      writer,
      Q.where(Columns.venues.artistId, artistId)
    );

    if (networkResults.artist.features.songs) {
      promises[Tables.setlistSongs] = upsertFullArtistProp<SetlistSong, SetlistSongWithPlayCount>(
        database,
        Tables.setlistSongs,
        networkResults.songs,
        writer,
        Q.where(Columns.setlistSongs.artistId, artistId)
      );
    }

    console.debug(`Going to wait on ${Object.values(promises).length} promises`);
    await Promise.all(Object.values(promises));
    console.debug(`Finished waiting on ${Object.values(promises).length} promises`);

    return (await promises[table]) as unknown as TModel[];
  });
}

function shouldMakeFullArtistApiRequest(artistId: string): () => boolean {
  return () => {
    const lastStartedAt = lastFullArtistUpsertStartedAt[artistId];

    if (!lastStartedAt) {
      return true;
    }

    return dayjs().diff(lastStartedAt) >= MIN_TIME_BETWEEN_FULL_ARTIST_API_CALLS_MS;
  };
}

export const useArtistYearsQuery = (artistId: string) => {
  return createRepoQueryHook(
    Tables.years,
    (years) => years.query(Q.where(Columns.years.artistId, artistId)).observe(),
    (apiClient) => apiClient.fullNormalizedArtist(artistId),
    shouldMakeFullArtistApiRequest(artistId),
    normalizedArtistNetworkResultUpsertBehavior,
    (years: Year[]) => {
      years.sort((a, b) => {
        return a.year.localeCompare(b.year);
      });

      return years;
    }
  );
};

export const useArtistYearShowsQuery = (artistId: string, yearId: string) => {
  return createRepoQueryHook(
    Tables.shows,
    (shows) => shows.query(Q.where(Columns.shows.yearId, yearId)).observe(),
    (apiClient) => apiClient.fullNormalizedArtist(artistId),
    shouldMakeFullArtistApiRequest(artistId),
    normalizedArtistNetworkResultUpsertBehavior,
    (shows: Show[]) => {
      shows.sort((a, b) => {
        return a.date.getTime() - b.date.getTime();
      });

      return shows;
    }
  );
};
