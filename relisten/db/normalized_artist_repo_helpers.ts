import { Database, Model, Q } from '@nozbe/watermelondb';
import { CopyableFromApi, UpdatableFromApi } from './database';
import { RelistenObject, RelistenUpdatableObject } from '../api/models/relisten';
import { WriterInterface } from '@nozbe/watermelondb/Database';
import { Clause } from '@nozbe/watermelondb/QueryDescription';
import * as R from 'remeda';
import { upsertNetworkResult } from './repo_query_hook';
import dayjs from 'dayjs';
import { FullArtist } from '../api/models/artist';
import { Columns, Tables } from './schema';
import Tour from './models/tour';
import { TourWithShowCount } from '../api/models/tour';
import Venue from './models/venue';
import { VenueWithShowCounts } from '../api/models/venue';
import SetlistSong from './models/setlist_song';
import { SetlistSongWithPlayCount } from '../api/models/setlist_song';

const MIN_TIME_BETWEEN_FULL_ARTIST_API_CALLS_MS = 10 * 60 * 1000;

export async function upsertFullArtistProp<
  TModel extends Model & CopyableFromApi<TApiModel> & UpdatableFromApi,
  TApiModel extends RelistenObject & RelistenUpdatableObject
>(
  database: Database,
  table: string,
  networkResults: TApiModel[],
  writer: WriterInterface,
  ...query: Clause[]
): Promise<TModel[]> {
  const dbResults = await database
    .get<TModel>(table)
    .query(...query)
    .fetch();

  const dbResultsById = R.flatMapToObj(dbResults, (model) => [[model.id, model]]);

  return await upsertNetworkResult(database, table, networkResults, dbResultsById, writer);
}

const lastFullArtistUpsertStartedAt: { [artistId: string]: dayjs.Dayjs } = {};

export async function normalizedArtistNetworkResultUpsertBehavior<
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

    await Promise.all(Object.values(promises));

    return (await promises[table]) as unknown as TModel[];
  }, 'normalizedArtistNetworkResultUpsertBehavior');
}

export function shouldMakeFullArtistApiRequest(artistId: string): () => boolean {
  return () => {
    const lastStartedAt = lastFullArtistUpsertStartedAt[artistId];

    if (!lastStartedAt) {
      return true;
    }

    return dayjs().diff(lastStartedAt) >= MIN_TIME_BETWEEN_FULL_ARTIST_API_CALLS_MS;
  };
}
