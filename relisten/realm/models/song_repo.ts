import { useMemo } from 'react';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '../network_backed_results';
import { Repository } from '../repository';
import { useRealm } from '../schema';
import { useArtist } from './artist_repo';
import { Song } from './song';
import { NetworkBackedBehaviorOptions } from '@/relisten/realm/network_backed_behavior';
import { NetworkBackedModelArrayBehavior } from '@/relisten/realm/network_backed_model_array_behavior';

export const songRepo = new Repository(Song);

export function useSongs(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();

  const behavior = useMemo(() => {
    return new NetworkBackedModelArrayBehavior(
      realm,
      songRepo,
      (realm) => realm.objects(Song).filtered('artistUuid == $0', artistUuid),
      (api) => api.songs(artistUuid),
      options
    );
  }, [realm, artistUuid, options]);

  return useNetworkBackedBehavior(behavior);
}

export const useArtistSongs = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid);
  const songsResults = useSongs(artistUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      songs: songsResults,
      artist: artistResults,
    });
  }, [songsResults, artistResults]);

  return results;
};
