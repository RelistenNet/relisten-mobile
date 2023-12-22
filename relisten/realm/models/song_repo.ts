import { useMemo } from 'react';
import { createNetworkBackedModelArrayHook } from '../network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '../network_backed_results';
import { Repository } from '../repository';
import { useQuery } from '../schema';
import { useArtist } from './artist_repo';
import { Song } from './song';

export const songRepo = new Repository(Song);

export const useSongs = (artistUuid: string) => {
  return createNetworkBackedModelArrayHook(
    songRepo,
    () => {
      const artistQuery = useQuery(
        Song,
        (query) => query.filtered('artistUuid == $0', artistUuid),
        [artistUuid]
      );

      return artistQuery;
    },
    (api) => api.songs(artistUuid)
  )();
};

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
