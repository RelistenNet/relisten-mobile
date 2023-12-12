import { Repository } from '../repository';
import { useQuery } from '../schema';
import { createNetworkBackedModelArrayHook } from '../network_backed_behavior_hooks';
import { useArtist } from './artist_repo';
import { mergeNetworkBackedResults } from '../network_backed_results';
import { useMemo } from 'react';
import Realm from 'realm';
import { Show } from './show';
import { Tour } from './tour';

export const tourRepo = new Repository(Tour);

export const useTours = (artistUuid: string) => {
  return createNetworkBackedModelArrayHook(
    tourRepo,
    () => {
      const artistQuery = useQuery(
        Tour,
        (query) => query.filtered('artistUuid == $0', artistUuid),
        [artistUuid]
      );

      return artistQuery;
    },
    (api) => api.tours(artistUuid)
  )();
};

export const useArtistTours = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid, { onlyFetchFromApiIfLocalIsNotShowable: true });
  const toursResults = useTours(artistUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      tours: toursResults,
      artist: artistResults,
    });
  }, [toursResults, artistResults]);

  return results;
};

export interface TourShows {
  tour: Tour | null;
  shows: Realm.Results<Show>;
}
