import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useMemo } from 'react';
import { createNetworkBackedModelArrayHook } from '../network_backed_behavior_hooks';
import { NetworkBackedResults } from '../network_backed_results';
import { Repository } from '../repository';
import { useQuery } from '../schema';
import { Artist } from './artist';

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
  // memoize to prevent trying a new request each time the options "change"
  const memoOptions = useMemo(() => {
    return {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable,
      ...options,
    };
  }, [options]);

  const artists = useArtists(memoOptions);

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
