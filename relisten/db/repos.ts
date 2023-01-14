import Artist from './models/artist';
import { Columns, Tables } from './schema';
import {
  createRepoQueryHook,
  createSimpleRepoQueryHook,
  defaultNetworkResultUpsertBehavior,
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
  ...query: Clause[]
): Promise<TModel[]> {
  const dbResults = await database
    .get<TModel>(table)
    .query(...query)
    .fetch();

  const dbResultsById = R.flatMapToObj(dbResults, (model) => [[model.id, model]]);

  console.debug('calling defaultNetworkResultUpsertBehavior for', table);
  return await defaultNetworkResultUpsertBehavior(database, table, networkResults, dbResultsById);
}

let lastFullArtistUpsertStartedAt: dayjs.Dayjs | undefined = undefined;

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
  lastFullArtistUpsertStartedAt = dayjs();

  const artistId = networkResults.artist.uuid;

  const promises: { [table: string]: Promise<Array<Model & UpdatableFromApi>> } = {};

  promises[Tables.years] = upsertFullArtistProp(
    database,
    Tables.years,
    networkResults.years,
    Q.where(Columns.years.artistId, artistId)
  );

  promises[Tables.shows] = upsertFullArtistProp(
    database,
    Tables.shows,
    networkResults.shows,
    Q.where(Columns.shows.artistId, artistId)
  );

  // TODO: venues, tours, songs

  await Promise.all(Object.values(promises));

  return (await promises[table]) as unknown as TModel[];
}

function shouldMakeFullArtistApiRequest(): boolean {
  if (!lastFullArtistUpsertStartedAt) {
    return true;
  }

  return dayjs().diff(lastFullArtistUpsertStartedAt) >= MIN_TIME_BETWEEN_FULL_ARTIST_API_CALLS_MS;
}

export const useArtistYearsQuery = (artistId: string) => {
  return createRepoQueryHook(
    Tables.years,
    (years) => years.query(Q.where(Columns.years.artistId, artistId)).observe(),
    (apiClient) => apiClient.fullNormalizedArtist(artistId),
    shouldMakeFullArtistApiRequest,
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
    shouldMakeFullArtistApiRequest,
    normalizedArtistNetworkResultUpsertBehavior,
    (shows: Show[]) => {
      shows.sort((a, b) => {
        return a.date.getTime() - b.date.getTime();
      });

      return shows;
    }
  );
};
