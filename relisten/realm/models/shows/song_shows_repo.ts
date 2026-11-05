import { detailRowUuids, orderedUuidRows, uuidRows } from '../../catalog_projection';
import { Artist } from '../artist';
import type { RelistenApiClient } from '@/relisten/api/client';
import { encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import type {
  V4ImportedSongWithShowsResource,
  V4SongWithShowsResource,
} from '@/relisten/api/v4/wire_types';
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
import { applyV4ImportedSong, applyV4Song } from '../../v4_catalog_apply';

import { ensureCatalogArtist, useArtist } from '../artist_repo';
import { Show } from '../show';
import { Song } from '../song';
import { CatalogQueryState, NormalizedSong } from '../v4_catalog';

export type SongCatalogKind = 'song' | 'imported_song';

export type SongShows =
  | { kind: 'song'; song: NormalizedSong | null; shows: Show[]; hasAppliedData: boolean }
  | { kind: 'imported_song'; song: Song | null; shows: Show[]; hasAppliedData: boolean };

function songDetailQueryKey(kind: SongCatalogKind, songId: string) {
  return kind === 'song'
    ? `GET /songs/${songId}`
    : `GET /imported-songs/${encodeV4UuidCatalogId(songId, 'imported_song')}`;
}

export class SongShowsNetworkBackedBehavior extends NetworkBackedBehavior<
  CatalogQueryState | null,
  V4SongWithShowsResource | V4ImportedSongWithShowsResource
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

  async fetchFromApi(api: RelistenApiClient, _force: boolean, etag?: string) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return this.kind === 'song'
      ? api.song(this.songId, { etag })
      : api.importedSong(this.songId, { etag });
  }

  isLocalDataShowable(state: CatalogQueryState | null) {
    return state?.hasAppliedData === true;
  }

  hasLocalData(_state: CatalogQueryState | null, resultIds: Iterable<string>) {
    const [rootId] = resultIds;
    if (!rootId) {
      return false;
    }
    const song =
      this.kind === 'song'
        ? this.realm.objectForPrimaryKey(NormalizedSong, rootId)
        : this.realm.objectForPrimaryKey(Song, this.songId);
    return song !== null && this.realm.objectForPrimaryKey(Artist, this.artistUuid) !== null;
  }

  upsert(
    _state: CatalogQueryState | null,
    resource: V4SongWithShowsResource | V4ImportedSongWithShowsResource
  ) {
    if (this.kind === 'song' && 'matched_track_count' in resource) {
      return applyV4Song(this.realm, this.artistUuid, resource);
    }

    if (
      this.kind === 'imported_song' &&
      'setlist_show_count' in resource &&
      resource.id === encodeV4UuidCatalogId(this.songId, 'imported_song')
    ) {
      return applyV4ImportedSong(this.realm, this.artistUuid, resource);
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
