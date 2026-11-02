import type { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { useRelistenApi } from '@/relisten/api/context';
import type { SongWithPlayCount } from '@/relisten/api/models/song';
import { decodeV4UuidCatalogId, encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import { NetworkBackedBehaviorOptions } from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { Repository } from '@/relisten/realm/repository';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';
import {
  MappedValueStream,
  RealmObjectValueStream,
  RealmQueryValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';

import { useArtist } from './artist_repo';
import { Song } from './song';
import { CatalogQueryState, NormalizedSong } from './v4_catalog';

export const songRepo = new Repository(Song);

export type ArtistSongBrowseItem =
  | { uuid: string; routeId: string; kind: 'song'; song: NormalizedSong }
  | { uuid: string; routeId: string; kind: 'imported_song'; song: Song };

interface ArtistSongsLocalData {
  queryState: CatalogQueryState | null;
  songs: Realm.Results<Song> | null;
}

function artistSongsQueryKey(artistUuid: string) {
  return `GET /artists/${encodeV4UuidCatalogId(artistUuid, 'artist')}/songs`;
}

function projectArtistSongBrowseItems(
  useV4: boolean,
  state: CatalogQueryState | null,
  normalizedSongs: Iterable<NormalizedSong>,
  importedSongs: Iterable<Song>
): ArtistSongBrowseItem[] {
  if (!useV4) {
    return Array.from(importedSongs, (song) => ({
      uuid: song.uuid,
      routeId: song.uuid,
      kind: 'imported_song',
      song,
    }));
  }

  if (state?.hasAppliedData !== true) return [];

  const normalizedById = new Map(Array.from(normalizedSongs, (song) => [song.id, song]));
  const importedByUuid = new Map(Array.from(importedSongs, (song) => [song.uuid, song]));

  return [...state.resultIds].flatMap((id): ArtistSongBrowseItem[] => {
    if (id.startsWith('song_')) {
      const song = normalizedById.get(id);
      return song ? [{ uuid: id, routeId: id, kind: 'song', song }] : [];
    }

    if (id.startsWith('imported_song_')) {
      const song = importedByUuid.get(decodeV4UuidCatalogId(id, 'imported_song'));
      return song ? [{ uuid: id, routeId: song.uuid, kind: 'imported_song', song }] : [];
    }

    return [];
  });
}

class ArtistSongsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  ArtistSongsLocalData,
  SongWithPlayCount[]
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string,
    private readonly useV4: boolean,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  override createLocalUpdatingResults(): ValueStream<ArtistSongsLocalData> {
    if (this.useV4) {
      return new MappedValueStream(
        new RealmObjectValueStream(
          this.realm,
          CatalogQueryState,
          artistSongsQueryKey(this.artistUuid)
        ),
        (queryState): ArtistSongsLocalData => ({ queryState, songs: null })
      );
    }

    return new MappedValueStream(
      new RealmQueryValueStream(
        this.realm,
        this.realm.objects(Song).filtered('artistUuid == $0 && deletedAt == nil', this.artistUuid)
      ),
      (songs): ArtistSongsLocalData => ({ queryState: null, songs })
    );
  }

  override fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<SongWithPlayCount[]>> {
    return this.useV4
      ? api.refreshV4ArtistSongs(this.artistUuid, forcedRefresh)
      : api.songs(this.artistUuid, api.refreshOptions(forcedRefresh));
  }

  override isLocalDataShowable(localData: ArtistSongsLocalData): boolean {
    return this.useV4
      ? localData.queryState?.hasAppliedData === true
      : (localData.songs?.length ?? 0) > 0;
  }

  override upsert(localData: ArtistSongsLocalData, apiData: SongWithPlayCount[]): void {
    if (this.useV4) return;

    if (localData.songs) {
      songRepo.upsertMultiple(this.realm, apiData, localData.songs, true, true);
    }
  }
}

export function useSongs(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const { apiClient } = useRelistenApi();
  const useV4 = apiClient.usesV4Catalog();
  const normalizedSongs = useQuery(
    NormalizedSong,
    (query) => query.filtered('artistUuid == $0', artistUuid),
    [artistUuid]
  );
  const importedSongs = useQuery(
    Song,
    (query) => query.filtered('artistUuid == $0 && deletedAt == nil', artistUuid),
    [artistUuid]
  );
  const behavior = useMemo(
    () => new ArtistSongsNetworkBackedBehavior(realm, artistUuid, useV4, options),
    [artistUuid, options, realm, useV4]
  );
  const results = useNetworkBackedBehavior(behavior);
  const data = useMemo(
    () =>
      projectArtistSongBrowseItems(
        useV4,
        results.data.queryState,
        normalizedSongs,
        useV4 ? importedSongs : (results.data.songs ?? [])
      ),
    [importedSongs, normalizedSongs, results.data, useV4]
  );

  return useMemo(() => {
    const resultIds = results.data.queryState?.resultIds;
    const hasCompleteAppliedProjection =
      results.data.queryState?.hasAppliedData === true &&
      resultIds !== undefined &&
      new Set(resultIds).size === resultIds.length &&
      data.length === resultIds.length;

    return {
      ...results,
      data,
      errors: hasCompleteAppliedProjection ? undefined : results.errors,
    };
  }, [data, results]);
}

export const useArtistSongs = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid);
  const songsResults = useSongs(artistUuid);

  return useMemo(
    () => mergeNetworkBackedResults({ songs: songsResults, artist: artistResults }),
    [songsResults, artistResults]
  );
};
