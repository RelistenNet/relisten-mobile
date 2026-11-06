import { useCallback, useMemo } from 'react';
import Realm from 'realm';
import {
  RelistenApiClient,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '@/relisten/api/client';
import { useRelistenApi } from '@/relisten/api/context';
import { applySongTracks } from '../catalog_apply';
import { useNetworkOnlyResults } from '../network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '../network_backed_results';
import { useRealm } from '../schema';
import { useArtist } from './artist_repo';
import { fetchSongShows } from './shows/song_shows_repo';
import { SongItem } from './song_view';
import { SourceTrack } from './source_track';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

export interface SongTracks {
  song: SongItem | null;
  tracks: SourceTrack[];
  isAvailable: boolean;
}
const EMPTY_SONG_TRACKS: SongTracks = { song: null, tracks: [], isAvailable: false };

export async function fetchSongTracks(
  realm: Realm,
  api: RelistenApiClient,
  artistUuid: string,
  songId: string,
  force = false
): Promise<RelistenApiResponse<SongTracks>> {
  try {
    // Full track resources need their shared show parents, not a persisted song/show collection.
    const shows = await fetchSongShows(realm, api, artistUuid, songId, force);
    if (!shows.data) return { ...shows, data: undefined };
    const response = await api.songTracks(songId, { force });
    if (!response.data || response.superseded) return { ...response, data: undefined };
    const result = realm.write(() => applySongTracks(realm, artistUuid, response.data!, songId));
    return {
      ...response,
      data: { song: new SongItem(result.song), tracks: result.tracks, isAvailable: true },
    };
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    return {
      type: RelistenApiResponseType.OnlineRequestCompleted,
      error: { error: cause, message: cause.message },
    };
  }
}

export function useSongTracks(artistUuid: string, songId: string) {
  const realm = useRealm();
  const { apiClient } = useRelistenApi();
  const online = useShouldMakeNetworkRequests();
  const fetch = useCallback(
    (force = false) => {
      if (!online) return Promise.resolve({ type: RelistenApiResponseType.Offline });
      return fetchSongTracks(realm, apiClient, artistUuid, songId, force);
    },
    [realm, apiClient, artistUuid, songId, online]
  );
  const result = useNetworkOnlyResults<SongTracks>(fetch);
  return { ...result, data: result.data ?? EMPTY_SONG_TRACKS };
}
export function useArtistSongTracks(artistUuid: string, songId: string) {
  const artist = useArtist(artistUuid);
  const songTracks = useSongTracks(artistUuid, songId);
  return useMemo(() => mergeNetworkBackedResults({ artist, songTracks }), [artist, songTracks]);
}
