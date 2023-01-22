import Artist from './models/artist';
import { Columns, Tables } from './schema';
import { createRepoQueryHook, createSimpleRepoQueryHook } from './repo_query_hook';
import { Q } from '@nozbe/watermelondb';
import Year from './models/year';
import Show from './models/show';
import {
  normalizedArtistNetworkResultUpsertBehavior,
  shouldMakeFullArtistApiRequest,
} from './normalized_artist_repo_helpers';
import { observeOne } from '../util/observe_one';
import type { Show as ApiShow } from '../api/models/show';
import type { Year as ApiYear } from '../api/models/year';
import type { ArtistWithCounts, FullArtist } from '../api/models/artist';
import { ShowWithSources } from '../api/models/source';

export const useAllArtistsQuery = createSimpleRepoQueryHook<
  Artist,
  ArtistWithCounts,
  ArtistWithCounts[],
  Artist[]
>(
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

export const useArtistYearsQuery = (artistId: string) => {
  return createRepoQueryHook<Year, ApiYear, FullArtist, Year[]>(
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
  return createRepoQueryHook<Show, ApiShow, FullArtist, Show[]>(
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

export const useArtistQuery = (artistId: string) => {
  return createSimpleRepoQueryHook<Artist, ArtistWithCounts, ArtistWithCounts, Artist | undefined>(
    Tables.artists,
    (artists) => artists.findAndObserve(artistId),
    (apiClient) => apiClient.artist(artistId)
  );
};

export const useYearQuery = (artistId: string, yearId: string) => {
  return createSimpleRepoQueryHook<Year, ApiYear, ApiYear, Year | undefined>(
    Tables.years,
    (years) => years.findAndObserve(yearId),
    (apiClient) => apiClient.year(artistId, yearId)
  );
};
