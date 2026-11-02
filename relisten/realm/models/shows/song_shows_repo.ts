import type { RelistenApiClient, RelistenApiResponse } from '@/relisten/api/client';
import { useRelistenApi } from '@/relisten/api/context';
import type { SongWithShows } from '@/relisten/api/models/song';
import { decodeV4UuidCatalogId, encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import { NetworkBackedBehaviorOptions } from '@/relisten/realm/network_backed_behavior';
import { useNetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior_hooks';
import {
  mergeNetworkBackedResults,
  NetworkBackedResults,
} from '@/relisten/realm/network_backed_results';
import { upsertShowList } from '@/relisten/realm/models/repo_utils';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';
import {
  CombinedValueStream,
  MappedValueStream,
  RealmObjectValueStream,
  RealmQueryValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { useMemo } from 'react';
import Realm from 'realm';

import { useArtist } from '../artist_repo';
import { Show } from '../show';
import { Song } from '../song';
import { songRepo } from '../song_repo';
import { CatalogQueryState, NormalizedSong } from '../v4_catalog';

export type SongCatalogKind = 'song' | 'imported_song';

export type SongShows =
  | { kind: 'song'; song: NormalizedSong | null; shows: Show[]; hasAppliedData: boolean }
  | { kind: 'imported_song'; song: Song | null; shows: Show[]; hasAppliedData: boolean };

interface LegacySongShows {
  song: Song | null;
  shows: Realm.Results<Show>;
}

interface SongShowsLocalData {
  queryState: CatalogQueryState | null;
  legacy: LegacySongShows | null;
}

function songDetailQueryKey(kind: SongCatalogKind, songId: string) {
  return kind === 'song'
    ? `GET /songs/${songId}`
    : `GET /imported-songs/${encodeV4UuidCatalogId(songId, 'imported_song')}`;
}

function projectSongShows(
  useV4: boolean,
  kind: SongCatalogKind,
  songId: string,
  state: CatalogQueryState | null,
  legacy: LegacySongShows | null,
  normalizedSongs: Iterable<NormalizedSong>,
  importedSongs: Iterable<Song>,
  allShows: Iterable<Show>
): SongShows {
  if (!useV4) {
    return {
      kind: 'imported_song',
      song: legacy?.song ?? null,
      shows: legacy ? Array.from(legacy.shows) : [],
      hasAppliedData: legacy?.song != null && legacy.shows.length > 0,
    };
  }

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

class SongShowsNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  SongShowsLocalData,
  SongWithShows
> {
  constructor(
    realm: Realm,
    private readonly useV4: boolean,
    private readonly artistUuid: string,
    private readonly songId: string,
    private readonly kind: SongCatalogKind,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  override createLocalUpdatingResults(): ValueStream<SongShowsLocalData> {
    if (this.useV4) {
      return new MappedValueStream(
        new RealmObjectValueStream(
          this.realm,
          CatalogQueryState,
          songDetailQueryKey(this.kind, this.songId)
        ),
        (queryState): SongShowsLocalData => ({ queryState, legacy: null })
      );
    }

    return new MappedValueStream(
      new CombinedValueStream(
        new RealmObjectValueStream(this.realm, Song, this.songId),
        new RealmQueryValueStream(
          this.realm,
          this.realm.objects(Show).filtered('ANY songs.uuid == $0 && deletedAt == nil', this.songId)
        ),
        (song, shows): LegacySongShows => ({
          song: song?.deletedAt == null ? song : null,
          shows,
        })
      ),
      (legacy): SongShowsLocalData => ({ queryState: null, legacy })
    );
  }

  override fetchFromApi(
    api: RelistenApiClient,
    forcedRefresh: boolean
  ): Promise<RelistenApiResponse<SongWithShows>> {
    if (!this.useV4) {
      return api.song(this.artistUuid, this.songId, api.refreshOptions(forcedRefresh));
    }

    return this.kind === 'song'
      ? api.refreshV4Song(this.artistUuid, this.songId, forcedRefresh)
      : api.refreshV4ImportedSong(this.artistUuid, this.songId, forcedRefresh);
  }

  override isLocalDataShowable(localData: SongShowsLocalData): boolean {
    if (this.useV4) return localData.queryState?.hasAppliedData === true;

    return localData.legacy?.song != null && localData.legacy.shows.length > 0;
  }

  override upsert(localData: SongShowsLocalData, apiData: SongWithShows): void {
    if (this.useV4) return;

    const legacy = localData.legacy;
    if (!legacy) return;
    const song = legacy.song;
    if (!legacy.shows.isValid() || !song?.isValid()) return;

    this.realm.write(() => {
      songRepo.upsert(
        this.realm,
        { ...apiData, shows_played_at: apiData.shows.length },
        song,
        true
      );

      upsertShowList(this.realm, apiData.shows, legacy.shows, {
        performDeletes: false,
        queryForModel: true,
        upsertModels: { song },
      });
    });
  }
}

export function useSongShows(
  artistUuid: string,
  songId: string,
  kind?: SongCatalogKind
): NetworkBackedResults<SongShows> {
  const realm = useRealm();
  const { apiClient } = useRelistenApi();
  const useV4 = apiClient.usesV4Catalog();
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
    () => new SongShowsNetworkBackedBehavior(realm, useV4, artistUuid, songId, effectiveKind),
    [artistUuid, effectiveKind, realm, songId, useV4]
  );
  const results = useNetworkBackedBehavior(behavior);
  const legacy = results.data.legacy;
  const data = projectSongShows(
    useV4,
    effectiveKind,
    songId,
    results.data.queryState,
    legacy,
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
