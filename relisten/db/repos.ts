import Artist from './models/artist';
import { Columns, Tables } from './schema';
import { createRepoQueryHook } from './repo_query_hook';
import { Q } from '@nozbe/watermelondb';
import Year from './models/year';
import Show from './models/show';

export const useAllArtistsQuery = createRepoQueryHook(
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
  return createRepoQueryHook(
    Tables.years,
    (years) => years.query(Q.where(Columns.years.artistId, artistId)).observe(),
    (apiClient) => apiClient.fullNormalizedArtist(artistId).then((a) => a.years),
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
    (apiClient) => apiClient.fullNormalizedArtist(artistId).then((a) => a.shows),
    (shows: Show[]) => {
      shows.sort((a, b) => {
        return a.date.getTime() - b.date.getTime();
      });

      return shows;
    }
  );
};
