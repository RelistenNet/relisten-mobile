import type { RelistenApiClient } from '@/relisten/api/client';
import { decodeV4UuidCatalogId, encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import type { V4ArtistSongEntryResource } from '@/relisten/api/v4/wire_types';
import {
  NetworkBackedBehavior,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { Repository } from '@/relisten/realm/repository';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { RealmObjectValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';
import { applyV4ArtistSongs, hasV4ArtistSongs } from '../v4_catalog_apply';

import { ensureCatalogArtist, useArtist } from './artist_repo';
import { Song } from './song';
import { CatalogQueryState, NormalizedSong } from './v4_catalog';

export const songRepo = new Repository(Song);

export type ArtistSongBrowseItem =
  | { uuid: string; routeId: string; kind: 'song'; song: NormalizedSong }
  | { uuid: string; routeId: string; kind: 'imported_song'; song: Song };

function artistSongsQueryKey(artistUuid: string) {
  return `GET /artists/${encodeV4UuidCatalogId(artistUuid, 'artist')}/songs`;
}

function projectArtistSongBrowseItems(
  state: CatalogQueryState | null,
  normalizedSongs: Iterable<NormalizedSong>,
  importedSongs: Iterable<Song>
): ArtistSongBrowseItem[] {
  if (state?.hasAppliedData !== true) {
    return [];
  }

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

export class ArtistSongsNetworkBackedBehavior extends NetworkBackedBehavior<
  CatalogQueryState | null,
  V4ArtistSongEntryResource[]
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  get queryKey() {
    return artistSongsQueryKey(this.artistUuid);
  }

  createLocalUpdatingResults(): ValueStream<CatalogQueryState | null> {
    return new RealmObjectValueStream(this.realm, CatalogQueryState, this.queryKey);
  }

  async fetchFromApi(api: RelistenApiClient, _force: boolean, etag?: string) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return api.songs(this.artistUuid, { etag });
  }

  isLocalDataShowable(state: CatalogQueryState | null) {
    return state?.hasAppliedData === true;
  }

  hasLocalData(_state: CatalogQueryState | null, resultIds: Iterable<string>) {
    return hasV4ArtistSongs(this.realm, this.artistUuid, resultIds);
  }

  upsert(_state: CatalogQueryState | null, resources: V4ArtistSongEntryResource[]) {
    return applyV4ArtistSongs(this.realm, this.artistUuid, resources);
  }
}

export function useSongs(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
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
    () => new ArtistSongsNetworkBackedBehavior(realm, artistUuid, options),
    [artistUuid, options, realm]
  );
  const results = useNetworkBackedBehavior(behavior);
  const data = useMemo(
    () => projectArtistSongBrowseItems(results.data, normalizedSongs, importedSongs),
    [importedSongs, normalizedSongs, results.data]
  );

  return useMemo(() => {
    const resultIds = results.data?.resultIds;
    const hasCompleteAppliedProjection =
      results.data?.hasAppliedData === true &&
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
