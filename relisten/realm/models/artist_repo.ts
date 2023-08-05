import { Repository } from '../repository';
import { useQuery } from '../schema';
import { useMemo } from 'react';
import { Artist } from './artist';
import { NetworkBackedResults } from '../network_backed_results';
import {
  createNetworkBackedModelArrayHook,
  NetworkBackedHookOptions,
} from '../network_backed_behavior_hooks';

export const artistRepo = new Repository(Artist);
export const useArtists = createNetworkBackedModelArrayHook(
  artistRepo,
  () => useQuery(Artist),
  (api) => api.artists()
);

export function useArtist(
  artistUuid?: string,
  options?: NetworkBackedHookOptions
): NetworkBackedResults<Artist | null> {
  const artists = useArtists(options);

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
