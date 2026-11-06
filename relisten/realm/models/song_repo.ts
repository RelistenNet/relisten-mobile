import type { RelistenApiClient } from '@/relisten/api/client';
import type { ArtistSongEntryResource } from '@/relisten/api/catalog/resources';
import { useMemo } from 'react';
import Realm from 'realm';
import { applyArtistSongs } from '../catalog_apply';
import { NetworkBackedBehavior, NetworkBackedBehaviorOptions } from '../network_backed_behavior';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { mergeNetworkBackedResults } from '../network_backed_results';
import { useRealm } from '../schema';
import { CombinedValueStream, RealmQueryValueStream } from '../value_streams';
import { NormalizedSong } from './catalog';
import { ensureCatalogArtist, useArtist } from './artist_repo';
import { Song } from './song';
import { SongItem } from './song_view';

export class ArtistSongsNetworkBackedBehavior extends NetworkBackedBehavior<
  SongItem[],
  ArtistSongEntryResource[]
> {
  constructor(
    realm: Realm,
    private readonly artistUuid: string,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }
  createLocalUpdatingResults() {
    const normalized = new RealmQueryValueStream(
      this.realm,
      this.realm
        .objects(NormalizedSong)
        .filtered('artistUuid == $0 AND deletedAt == nil', this.artistUuid)
    );
    const imported = new RealmQueryValueStream(
      this.realm,
      this.realm.objects(Song).filtered('artistUuid == $0 AND deletedAt == nil', this.artistUuid)
    );
    return new CombinedValueStream(normalized, imported, (normalized, imported) =>
      [...normalized, ...imported].map((row) => new SongItem(row))
    );
  }
  async fetchFromApi(api: RelistenApiClient, force: boolean) {
    await ensureCatalogArtist(this.realm, api, this.artistUuid);
    return api.songs(this.artistUuid, { force });
  }
  isLocalDataShowable(data: SongItem[]) {
    return data.length > 0;
  }
  upsert(_data: SongItem[], resources: ArtistSongEntryResource[]) {
    applyArtistSongs(this.realm, this.artistUuid, resources);
  }
}

export function useSongs(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const behavior = useMemo(
    () => new ArtistSongsNetworkBackedBehavior(realm, artistUuid, options),
    [realm, artistUuid, options]
  );
  return useNetworkBackedBehavior(behavior);
}

export function useArtistSongs(artistUuid: string) {
  const songs = useSongs(artistUuid);
  const artist = useArtist(artistUuid);
  return useMemo(() => mergeNetworkBackedResults({ songs, artist }), [songs, artist]);
}
