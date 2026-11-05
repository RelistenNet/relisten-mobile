import { saveCatalogResults } from '../../catalog_projection';
import { detailRowUuids, orderedUuidRows, uuidRows } from '../../catalog_projection';
import type { RelistenApiClient } from '@/relisten/api/client';
import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type {
  ImportedSongWithShowsResource,
  SongWithShowsResource,
} from '@/relisten/api/catalog/resources';
import {
  NetworkBackedBehavior,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import {
  mergeNetworkBackedResults,
  NetworkBackedResults,
} from '@/relisten/realm/network_backed_results';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { RealmObjectValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';
import { applyImportedSongDetail, applySongDetail } from '../../catalog_apply';

import { ensureCatalogArtist, useArtist } from '../artist_repo';
import { Show } from '../show';
import { Song } from '../song';
import { CatalogQueryState, NormalizedSong } from '../catalog';

export type SongCatalogKind = 'song' | 'imported_song';

export type SongShows =
  | { kind: 'song'; song: NormalizedSong | null; shows: Show[]; hasAppliedData: boolean }
  | { kind: 'imported_song'; song: Song | null; shows: Show[]; hasAppliedData: boolean };

function songDetailQueryKey(kind: SongCatalogKind, songId: string) {
  return kind === 'song'
    ? `GET /songs/${songId}`
    : `GET /imported-songs/${encodeUuidCatalogId(songId, 'imported_song')}`;
}

export class SongShowsNetworkBackedBehavior extends NetworkBackedBehavior<
  CatalogQueryState | null,
  SongWithShowsResource | ImportedSongWithShowsResource
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string,
    private readonly songId: string,
    private readonly kind: SongCatalogKind,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  get queryKey() {
    return songDetailQueryKey(this.kind, this.songId);
  }

  createLocalUpdatingResults(): ValueStream<CatalogQueryState | null> {
    return new RealmObjectValueStream(this.realm, CatalogQueryState, this.queryKey);
  }

  async fetchFromApi(api: RelistenApiClient, force: boolean) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return this.kind === 'song'
      ? api.song(this.songId, { force })
      : api.importedSong(this.songId, { force });
  }

  isLocalDataShowable(state: CatalogQueryState | null) {
    return state?.hasAppliedData === true;
  }

  upsert(
    _state: CatalogQueryState | null,
    resource: SongWithShowsResource | ImportedSongWithShowsResource
  ) {
    if (this.kind === 'song' && 'matched_track_count' in resource) {
      return saveCatalogResults(
        this.realm,
        this.queryKey,
        applySongDetail(this.realm, this.artistUuid, resource)
      );
    }

    if (
      this.kind === 'imported_song' &&
      'setlist_show_count' in resource &&
      resource.id === encodeUuidCatalogId(this.songId, 'imported_song')
    ) {
      return saveCatalogResults(
        this.realm,
        this.queryKey,
        applyImportedSongDetail(this.realm, this.artistUuid, resource)
      );
    }

    throw new Error('Unexpected song detail identity or kind.');
  }
}

export function useSongShows(
  artistUuid: string,
  songId: string,
  kind?: SongCatalogKind
): NetworkBackedResults<SongShows> {
  const realm = useRealm();
  const effectiveKind = kind ?? (songId.startsWith('song_') ? 'song' : 'imported_song');
  const behavior = useMemo(
    () => new SongShowsNetworkBackedBehavior(realm, artistUuid, songId, effectiveKind),
    [artistUuid, effectiveKind, realm, songId]
  );
  const results = useNetworkBackedBehavior(behavior);
  const rootId = results.data?.hasAppliedData ? results.data.resultIds[0] : undefined;
  const normalizedSongs = useQuery(
    NormalizedSong,
    (query) => query.filtered('id == $0', effectiveKind === 'song' ? (rootId ?? '') : ''),
    [effectiveKind, rootId]
  );
  const importedSongs = useQuery(
    Song,
    (query) =>
      query.filtered(
        'uuid == $0 AND deletedAt == nil',
        effectiveKind === 'imported_song' && rootId ? songId : ''
      ),
    [effectiveKind, rootId, songId]
  );
  const uuids = useMemo(() => detailRowUuids(results.data, 'show'), [results.data]);
  const shows = useQuery(
    Show,
    (query) => uuidRows(query, uuids).filtered('artistUuid == $0', artistUuid),
    [artistUuid, uuids]
  );
  const data = useMemo<SongShows>(() => {
    const ordered = orderedUuidRows(shows, uuids);
    const hasAppliedData =
      results.data?.hasAppliedData === true && ordered.length === results.data.resultIds.length - 1;
    if (effectiveKind === 'song') {
      const song = normalizedSongs[0] ?? null;
      return {
        kind: effectiveKind,
        song,
        shows: ordered,
        hasAppliedData: hasAppliedData && song !== null,
      };
    }
    const song = importedSongs[0] ?? null;
    return {
      kind: effectiveKind,
      song,
      shows: ordered,
      hasAppliedData: hasAppliedData && song !== null,
    };
  }, [effectiveKind, importedSongs, normalizedSongs, results.data, shows, uuids]);

  return { ...results, data };
}

export const useArtistSongShows = (artistUuid: string, songId: string, kind?: SongCatalogKind) => {
  const artistResults = useArtist(artistUuid);
  const songResults = useSongShows(artistUuid, songId, kind);

  return useMemo(
    () => mergeNetworkBackedResults({ song: songResults, artist: artistResults }),
    [songResults, artistResults]
  );
};
