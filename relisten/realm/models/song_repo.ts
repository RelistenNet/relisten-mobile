import { saveCatalogResults } from '../catalog_projection';
import { indexRows, uuidRows } from '../catalog_projection';
import type { RelistenApiClient } from '@/relisten/api/client';
import { decodeUuidCatalogId, encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { ArtistSongEntryResource } from '@/relisten/api/catalog/resources';
import {
  NetworkBackedBehavior,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '@/relisten/realm/network_backed_results';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { RealmObjectValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';
import { applyArtistSongs } from '../catalog_apply';

import { ensureCatalogArtist, useArtist } from './artist_repo';
import { Song } from './song';
import { CatalogQueryState, NormalizedSong } from './catalog';

export type ArtistSongBrowseItem =
  | { uuid: string; routeId: string; kind: 'song'; song: NormalizedSong }
  | { uuid: string; routeId: string; kind: 'imported_song'; song: Song };

function artistSongsQueryKey(artistUuid: string) {
  return `GET /artists/${encodeUuidCatalogId(artistUuid, 'artist')}/songs`;
}

function projectArtistSongBrowseItems(
  state: CatalogQueryState | null,
  keys: readonly string[],
  normalizedSongs: ArrayLike<NormalizedSong>,
  importedSongs: ArrayLike<Song>
): ArtistSongBrowseItem[] {
  if (state?.hasAppliedData !== true) {
    return [];
  }
  const normalizedById = indexRows(normalizedSongs, (song) => song.id);
  const importedByUuid = indexRows(importedSongs, (song) => song.uuid);
  const items: ArtistSongBrowseItem[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const id = state.resultIds[index];
    if (id.startsWith('song_')) {
      const song = normalizedById.get(keys[index]);
      if (song) {
        items.push({ uuid: id, routeId: id, kind: 'song', song });
      }
    } else if (id.startsWith('imported_song_')) {
      const song = importedByUuid.get(keys[index]);
      if (song) {
        items.push({ uuid: id, routeId: song.uuid, kind: 'imported_song', song });
      }
    }
  }
  return items;
}

export class ArtistSongsNetworkBackedBehavior extends NetworkBackedBehavior<
  CatalogQueryState | null,
  ArtistSongEntryResource[]
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

  async fetchFromApi(api: RelistenApiClient, force: boolean) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return api.songs(this.artistUuid, { force });
  }

  isLocalDataShowable(state: CatalogQueryState | null) {
    return state?.hasAppliedData === true;
  }

  upsert(_state: CatalogQueryState | null, resources: ArtistSongEntryResource[]) {
    return saveCatalogResults(
      this.realm,
      this.queryKey,
      applyArtistSongs(this.realm, this.artistUuid, resources)
    );
  }
}

export function useSongs(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const behavior = useMemo(
    () => new ArtistSongsNetworkBackedBehavior(realm, artistUuid, options),
    [artistUuid, options, realm]
  );
  const results = useNetworkBackedBehavior(behavior);
  const keys = useMemo(() => {
    const keys: string[] = [];
    if (results.data?.hasAppliedData) {
      const ids = results.data.resultIds;
      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        keys.push(id.startsWith('imported_song_') ? decodeUuidCatalogId(id, 'imported_song') : id);
      }
    }
    return keys;
  }, [results.data]);
  const normalizedSongs = useQuery(
    NormalizedSong,
    (query) => query.filtered('id IN $0 AND artistUuid == $1', keys, artistUuid),
    [artistUuid, keys]
  );
  const importedSongs = useQuery(
    Song,
    (query) => uuidRows(query, keys).filtered('artistUuid == $0', artistUuid),
    [artistUuid, keys]
  );
  const data = useMemo(
    () => projectArtistSongBrowseItems(results.data, keys, normalizedSongs, importedSongs),
    [normalizedSongs, importedSongs, keys, results.data]
  );

  return useMemo(() => {
    const resultIds = results.data?.resultIds;
    const hasCompleteAppliedProjection =
      results.data?.hasAppliedData === true &&
      resultIds !== undefined &&
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
