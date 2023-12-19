import { Repository } from '../repository';
import { useQuery } from '../schema';
import { useMemo } from 'react';
import { Artist } from './artist';
import { NetworkBackedResults } from '../network_backed_results';
import { createNetworkBackedModelArrayHook } from '../network_backed_behavior_hooks';
import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';

export const artistRepo = new Repository(Artist);
export const useArtists = createNetworkBackedModelArrayHook(
  artistRepo,
  () => useQuery(Artist),
  (api) => api.artists()
);

export function useArtist(
  artistUuid?: string,
  options?: NetworkBackedBehaviorOptions
): NetworkBackedResults<Artist | null> {
  const artists = useArtists({
    fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable,
    ...options,
  });

  const artistQuery = useMemo(() => {
    return artists.data.filtered('uuid == $0', artistUuid);
  }, [artists.data]);

  const artist = useMemo(() => {
    if (artistQuery.length > 0) {
      return artistQuery[0];
    }

    return null;
  }, [artistQuery]);

  return { ...artists, data: artist };
}
