import { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { SongWithShows } from '@/relisten/api/models/song';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';
import { useMemo } from 'react';
import Realm from 'realm';
import { NetworkBackedBehaviorOptions } from '../../network_backed_behavior';
import { useNetworkBackedBehavior } from '../../network_backed_behavior_hooks';
import { mergeNetworkBackedResults, NetworkBackedResults } from '../../network_backed_results';
import { useArtist } from '../artist_repo';
import { Show } from '../show';
import { Song } from '../song';
import { songRepo } from '../song_repo';
import { useRealm } from '@/relisten/realm/schema';
import {
  ActiveCatalogObjectValueStream,
  CombinedValueStream,
  RealmQueryValueStream,
  RetainedCatalogObjectValueStream,
  RetainedCatalogResultsValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';
import { activeCatalogObjects } from '@/relisten/realm/catalog_retirement';
import { useGroupSegment } from '@/relisten/util/routes';

export interface SongShows {
  song: Song | null;
  shows: Realm.Results<Show>;
}

class SongShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  SongShows,
  SongWithShows
> {
  constructor(
    realm: Realm.Realm,
    public artistUuid: string,
    public songUuid: string,
    private includeRetiredCatalog: boolean,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<SongWithShows>> {
    return api.song(this.artistUuid, this.songUuid, api.refreshOptions(forcedRefresh));
  }

  override createLocalUpdatingResults(): ValueStream<SongShows> {
    const songResults = this.includeRetiredCatalog
      ? new RetainedCatalogObjectValueStream(this.realm, Song, this.songUuid, 'song-detail.root')
      : new ActiveCatalogObjectValueStream(this.realm, Song, this.songUuid, 'song-detail.root');
    const catalogShows = this.includeRetiredCatalog
      ? this.realm.objects(Show)
      : activeCatalogObjects(this.realm, Show);
    const showsQuery = catalogShows.filtered('ANY songs.uuid == $0', this.songUuid);
    const showsResults = this.includeRetiredCatalog
      ? new RetainedCatalogResultsValueStream(this.realm, showsQuery, 'song-detail.shows')
      : new RealmQueryValueStream(this.realm, showsQuery);

    return new CombinedValueStream(songResults, showsResults, (song, shows) => {
      return { song, shows };
    });
  }

  isLocalDataShowable(localData: SongShows): boolean {
    return localData.song !== null && localData.shows.length > 0;
  }

  override upsert(localData: SongShows, apiData: SongWithShows): void {
    if (!localData.shows.isValid()) {
      return;
    }

    this.realm.write(() => {
      const { allModels } = songRepo.upsert(
        this.realm,
        { ...apiData, shows_played_at: apiData.shows.length },
        localData.song || undefined
      );

      upsertShowList(this.realm, apiData.shows, localData.shows, {
        // we may not have all the shows here on initial load
        performDeletes: false,
        upsertModels: {
          song: allModels.length > 0 ? allModels[0] : undefined,
        },
      });
    });
  }
}

export function useSongShows(
  artistUuid: string,
  songUuid: string
): NetworkBackedResults<SongShows> {
  const realm = useRealm();
  const groupSegment = useGroupSegment();
  const includeRetiredCatalog = groupSegment !== '(artists)';
  const behavior = useMemo(() => {
    return new SongShowsNetworkBackedBehavior(realm, artistUuid, songUuid, includeRetiredCatalog);
  }, [realm, artistUuid, songUuid, includeRetiredCatalog]);

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
