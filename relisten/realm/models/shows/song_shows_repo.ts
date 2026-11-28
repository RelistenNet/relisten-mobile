import { useCallback, useMemo } from 'react';
import Realm from 'realm';
import {
  RelistenApiClient,
  RelistenApiResponse,
  RelistenApiResponseType,
} from '@/relisten/api/client';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { useRelistenApi } from '@/relisten/api/context';
import { applyImportedSongDetail, applySongDetail } from '../../catalog_apply';
import { useNetworkOnlyResults } from '../../network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '../../network_backed_results';
import { useRealm } from '../../schema';
import { ensureCatalogArtist, useArtist } from '../artist_repo';
import { catalogPopularitySnapshot, type PopularitySnapshot } from '../popularity';
import { Show } from '../show';
import { importedSongUuid, SongItem } from '../song_view';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

export interface SongShows {
  song: SongItem | null;
  shows: Show[];
  /** Canonical song results have their own play statistics for each show. */
  popularityByShow?: ReadonlyMap<string, PopularitySnapshot | null>;
  isAvailable: boolean;
}
const EMPTY_SONG_SHOWS: SongShows = { song: null, shows: [], isAvailable: false };

/** Returns this request's selection; shared show metadata is applied without storing song membership. */
export async function fetchSongShows(
  realm: Realm,
  api: RelistenApiClient,
  artistUuid: string,
  songId: string,
  force = false
): Promise<RelistenApiResponse<SongShows>> {
  try {
    await ensureCatalogArtist(realm, api, artistUuid);
    if (songId.startsWith('song_')) {
      const response = await api.song(songId, { force });
      const { data } = response;
      if (!data || response.superseded) {
        return { ...response, data: undefined };
      }
      const result = realm.write(() => applySongDetail(realm, artistUuid, data, songId));
      const popularityByShow = new Map(
        data.shows.map(({ show, song_popularity }) => [
          decodeUuidCatalogId(show.id, 'show'),
          catalogPopularitySnapshot(song_popularity),
        ])
      );
      return {
        ...response,
        data: {
          song: new SongItem(result.song),
          shows: result.shows,
          popularityByShow,
          isAvailable: true,
        },
      };
    }
    const response = await api.importedSong(importedSongUuid(songId), { force });
    if (!response.data || response.superseded) return { ...response, data: undefined };
    const result = realm.write(() => applyImportedSongDetail(realm, artistUuid, response.data!));
    return {
      ...response,
      data: { song: new SongItem(result.song), shows: result.shows, isAvailable: true },
    };
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    return {
      type: RelistenApiResponseType.OnlineRequestCompleted,
      error: { error: cause, message: cause.message },
    };
  }
}

export function useSongShows(artistUuid: string, songId: string) {
  const realm = useRealm();
  const { apiClient } = useRelistenApi();
  const online = useShouldMakeNetworkRequests();
  const fetch = useCallback(
    (force = false) => {
      if (!online) return Promise.resolve({ type: RelistenApiResponseType.Offline });
      return fetchSongShows(realm, apiClient, artistUuid, songId, force);
    },
    [realm, apiClient, artistUuid, songId, online]
  );
  const result = useNetworkOnlyResults<SongShows>(fetch);
  return { ...result, data: result.data ?? EMPTY_SONG_SHOWS };
}
export function useArtistSongShows(artistUuid: string, songId: string) {
  const song = useSongShows(artistUuid, songId);
  const artist = useArtist(artistUuid);
  return useMemo(() => mergeNetworkBackedResults({ song, artist }), [song, artist]);
}
