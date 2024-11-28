import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { SongWithShows } from '@/relisten/api/models/song';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';
import { useMemo } from 'react';
import Realm from 'realm';
import {
  NetworkBackedBehaviorOptions,
  ThrottledNetworkBackedBehavior,
} from '../../network_backed_behavior';
import { useNetworkBackedBehavior } from '../../network_backed_behavior_hooks';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../../network_backed_results';
import { useObject, useQuery } from '../../schema';
import { useArtist } from '../artist_repo';
import { Show } from '../show';
import { Song } from '../song';
import { songRepo } from '../song_repo';

export interface SongShows {
  song: Song | null;
  shows: Realm.Results<Show>;
}

class SongShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  SongShows,
  SongWithShows
> {
  private showUuids: string[] = [];
  constructor(
    public artistUuid: string,
    public songUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(options);
  }

  fetchFromApi(api: RelistenApiClient): Promise<RelistenApiResponse<SongWithShows>> {
    return api.song(this.artistUuid, this.songUuid);
  }

  useFetchFromLocal(): SongShows {
    const song = useObject(Song, this.songUuid) || null;
    const shows = useQuery(Show, (query) => query.filtered('uuid in $0', this.showUuids), [
      this.showUuids,
    ]);

    const obj = useMemo(() => {
      return { song, shows };
    }, [song, shows]);

    return obj;
  }

  isLocalDataShowable(localData: SongShows): boolean {
    return localData.song !== null && localData.shows.length > 0;
  }

  upsert(realm: Realm, localData: SongShows, apiData: SongWithShows): void {
    if (!localData.shows.isValid()) {
      return;
    }

    realm.write(() => {
      upsertShowList(realm, apiData.shows, localData.shows, {
        // we may not have all the shows here on initial load
        performDeletes: false,
        queryForModel: true,
      });

      songRepo.upsert(
        realm,
        { ...apiData, shows_played_at: apiData.shows.length },
        localData.song || undefined
      );
    });

    this.showUuids = apiData.shows.map((s) => s.uuid);
  }
}

export function useSongShows(
  artistUuid: string,
  songUuid: string
): NetworkBackedResults<SongShows> {
  const behavior = useMemo(() => {
    return new SongShowsNetworkBackedBehavior(artistUuid, songUuid);
  }, [artistUuid, songUuid]);

  return useNetworkBackedBehavior(behavior);
}

export const useArtistSongShows = (artistUuid: string, songUuid: string) => {
  const artistResults = useArtist(artistUuid);
  const songResults = useSongShows(artistUuid, songUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      song: songResults,
      artist: artistResults,
    });
  }, [songResults, artistResults]);

  return results;
};
