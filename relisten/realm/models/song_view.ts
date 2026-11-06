import { decodeUuidCatalogId, encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { FavoriteCatalogTarget } from '@/relisten/library/favorite_catalog_target';
import { NormalizedSong } from './catalog';
import { Song } from './song';

/** A live song reference shared by browse, detail, favorites, and navigation. */
export class SongItem {
  constructor(readonly record: Song | NormalizedSong) {}

  get uuid() {
    if (this.record instanceof Song) return encodeUuidCatalogId(this.record.uuid, 'imported_song');
    return this.record.id;
  }
  get artistUuid() {
    return this.record.artistUuid;
  }
  get name() {
    return this.record.name;
  }
  get showCount() {
    if (this.record instanceof Song) return this.record.showsPlayedAt;
    return this.record.matchedShowCount ?? 0;
  }
  get recordingCount() {
    if (this.record instanceof Song) return null;
    return this.record.matchedTrackCount ?? null;
  }
  get favorite(): FavoriteCatalogTarget {
    if (this.record instanceof Song)
      return { targetKind: 'imported_song', catalogId: this.record.uuid };
    return { targetKind: 'song', catalogId: this.record.id };
  }
}

/** Old links carry a raw UUID; current links carry the opaque catalog ID. */
export function importedSongUuid(id: string) {
  if (id.startsWith('imported_song_')) return decodeUuidCatalogId(id, 'imported_song');
  return id;
}
