import { Artist } from '../artist';
import type { RelistenApiClient } from '@/relisten/api/client';
import { decodeV4UuidCatalogId, encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
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

function projectSongShows(
  kind: SongCatalogKind,
  songId: string,
  state: CatalogQueryState | null,
  normalizedSongs: Iterable<NormalizedSong>,
  importedSongs: Iterable<Song>,
  allShows: Iterable<Show>
): SongShows {
  if (state?.hasAppliedData !== true || state.resultIds.length === 0) {
    return kind === 'song'
      ? { kind, song: null, shows: [], hasAppliedData: false }
      : { kind, song: null, shows: [], hasAppliedData: false };
  }

  const rootId = state.resultIds[0];
  const showsByUuid = new Map(Array.from(allShows, (show) => [show.uuid, show]));
  const showIds = [...state.resultIds].slice(1);
  const shows: Show[] = [];
  let hasCompleteShowProjection = new Set(showIds).size === showIds.length;
  for (const showId of showIds) {
    let show: Show | undefined;
    try {
      show = showsByUuid.get(decodeV4UuidCatalogId(showId, 'show'));
    } catch {
      hasCompleteShowProjection = false;
      continue;
    }

    if (!show || show.deletedAt != null) {
      hasCompleteShowProjection = false;
      continue;
    }
    shows.push(show);
  }

  if (kind === 'song') {
    const song = Array.from(normalizedSongs).find((candidate) => candidate.id === rootId) ?? null;
    return {
      kind,
      song,
      shows,
      hasAppliedData: hasCompleteShowProjection && song !== null,
    };
  }

  let importedSongUuid: string | undefined;
  try {
    importedSongUuid = decodeV4UuidCatalogId(rootId, 'imported_song');
  } catch {
    // An incomplete cached projection must not hide a failed repair.
  }
  const song =
    Array.from(importedSongs).find((candidate) => candidate.uuid === importedSongUuid) ?? null;
  return {
    kind,
    song,
    shows,
    hasAppliedData: hasCompleteShowProjection && importedSongUuid === songId && song !== null,
  };
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
  const shows = useQuery(
    Show,
    (query) => query.filtered('artistUuid == $0 && deletedAt == nil', artistUuid),
    [artistUuid]
  );
  const behavior = useMemo(
    () => new SongShowsNetworkBackedBehavior(realm, artistUuid, songId, effectiveKind),
    [artistUuid, effectiveKind, realm, songId]
  );
  const results = useNetworkBackedBehavior(behavior);
  const data = projectSongShows(
    effectiveKind,
    songId,
    results.data,
    normalizedSongs,
    importedSongs,
    shows
  );

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
