import { detailRowUuids, orderedUuidRows, uuidRows } from '../catalog_projection';
import { Artist } from './artist';
import type { RelistenApiClient } from '@/relisten/api/client';
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

import type { V4SongWithTracksResource } from '@/relisten/api/v4/wire_types';
import { applyV4SongTracks } from '../v4_catalog_apply';
import { ensureCatalogArtist, useArtist } from './artist_repo';
import { SongShowsNetworkBackedBehavior } from './shows/song_shows_repo';
import { SourceTrack } from './source_track';
import { CatalogQueryState, NormalizedSong } from './v4_catalog';

export interface SongTracks {
  song: NormalizedSong | null;
  tracks: SourceTrack[];
  hasAppliedData: boolean;
}

function songTracksQueryKey(songId: string) {
  return `GET /songs/${songId}/tracks`;
}

export class SongTracksNetworkBackedBehavior extends NetworkBackedBehavior<
  CatalogQueryState | null,
  V4SongWithTracksResource
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string,
    private readonly songId: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  get queryKey() {
    return songTracksQueryKey(this.songId);
  }

  async fetchFromApi(api: RelistenApiClient, force: boolean, etag?: string) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);

    // The recordings response carries show IDs, not show bodies. Resolve its
    // parent collection through the show repo, including on a cold direct entry.
    const shows = new SongShowsNetworkBackedBehavior(
      this.realm,
      this.artistUuid,
      this.songId,
      'song'
    ).sharedExecutor(api);
    await shows.refresh(force);
    const errors = shows.currentResults().errors;
    shows.tearDown();
    if (errors?.length) {
      throw errors[0].error ?? new Error(errors[0].message);
    }

    return api.songTracks(this.songId, { etag });
  }

  override createLocalUpdatingResults(): ValueStream<CatalogQueryState | null> {
    return new RealmObjectValueStream(
      this.realm,
      CatalogQueryState,
      songTracksQueryKey(this.songId)
    );
  }

  override isLocalDataShowable(state: CatalogQueryState | null): boolean {
    return state?.hasAppliedData === true;
  }

  hasLocalData(_state: CatalogQueryState | null, resultIds: Iterable<string>) {
    const [rootId] = resultIds;
    return (
      rootId !== undefined &&
      this.realm.objectForPrimaryKey(Artist, this.artistUuid) !== null &&
      this.realm.objectForPrimaryKey(NormalizedSong, rootId) !== null
    );
  }

  upsert(_state: CatalogQueryState | null, resource: V4SongWithTracksResource) {
    return applyV4SongTracks(this.realm, this.artistUuid, resource);
  }
}

export function useSongTracks(
  artistUuid: string,
  songId: string,
  options?: NetworkBackedBehaviorOptions
) {
  const realm = useRealm();
  const behavior = useMemo(
    () => new SongTracksNetworkBackedBehavior(realm, artistUuid, songId, options),
    [artistUuid, options, realm, songId]
  );
  const results = useNetworkBackedBehavior(behavior);
  const rootId = results.data?.hasAppliedData ? results.data.resultIds[0] : undefined;
  const songs = useQuery(NormalizedSong, (query) => query.filtered('id == $0', rootId ?? ''), [
    rootId,
  ]);
  const uuids = useMemo(() => detailRowUuids(results.data, 'track'), [results.data]);
  const tracks = useQuery(
    SourceTrack,
    (query) => uuidRows(query, uuids).filtered('artistUuid == $0', artistUuid),
    [artistUuid, uuids]
  );
  const data = useMemo<SongTracks>(() => {
    const ordered = orderedUuidRows(tracks, uuids);
    const song = songs[0] ?? null;
    return {
      song,
      tracks: ordered,
      hasAppliedData:
        results.data?.hasAppliedData === true &&
        song !== null &&
        ordered.length === results.data.resultIds.length - 1,
    };
  }, [results.data, songs, tracks, uuids]);

  return { ...results, data };
}

export function useArtistSongTracks(artistUuid: string, songId: string) {
  const artistResults = useArtist(artistUuid);
  const tracksResults = useSongTracks(artistUuid, songId);

  return useMemo(
    () => mergeNetworkBackedResults({ songTracks: tracksResults, artist: artistResults }),
    [artistResults, tracksResults]
  );
}
