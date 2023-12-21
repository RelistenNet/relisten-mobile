import { Repository } from '../repository';
import { useQuery } from '../schema';
import { createNetworkBackedModelArrayHook } from '../network_backed_behavior_hooks';
import { useArtist } from './artist_repo';
import { mergeNetworkBackedResults } from '../network_backed_results';
import { useMemo } from 'react';
import { Venue } from './venue';

export const venueRepo = new Repository(Venue);

export const useVenues = (artistUuid: string) => {
  return createNetworkBackedModelArrayHook(
    venueRepo,
    () => {
      const artistQuery = useQuery(
        Venue,
        (query) => query.filtered('artistUuid == $0', artistUuid),
        [artistUuid]
      );

      return artistQuery;
    },
    (api) => api.venues(artistUuid)
  )();
};

export const useArtistVenues = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid);
  const venuesResults = useVenues(artistUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      venues: venuesResults,
      artist: artistResults,
    });
  }, [venuesResults, artistResults]);

  return results;
};
