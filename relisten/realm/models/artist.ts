import Realm from 'realm';
import { Features, StoredArtistUpstreamSource } from '../../api/models/artist';
import { LegacyFavoriteMirror } from '../legacy_favorite_mirror';
import { checkIfOfflineSourceTrackExists } from '../realm_filters';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { SourceTrack } from './source_track';
import { Popularity } from './popularity';
import type { LibraryIndex } from '@/relisten/realm/library_index';

export interface ArtistRequiredProperties extends RelistenObjectRequiredProperties {
  musicbrainzId: string;
  name: string;
  featured: Realm.Types.Int;
  slug: string;
  sortName: string;
  popularity?: Popularity;
  featuresRaw: string;
  upstreamSourcesRaw: string;
  showCount: Realm.Types.Int;
  sourceCount: Realm.Types.Int;
}

export enum ArtistFeaturedFlags {
  None = 0,
  Featured = 1 << 0,
  AutoCreated = 1 << 1,
}

export class Artist
  extends Realm.Object<Artist, keyof ArtistRequiredProperties>
  implements ArtistRequiredProperties, LegacyFavoriteMirror
{
  static schema: Realm.ObjectSchema = {
    name: 'Artist',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: { type: 'date', optional: true, indexed: true },
      musicbrainzId: 'string',
      name: 'string',
      featured: 'int',
      slug: 'string',
      sortName: 'string',
      popularity: 'Popularity?',
      featuresRaw: 'string',
      upstreamSourcesRaw: 'string',
      showCount: 'int',
      sourceCount: 'int',
      // Deprecated compatibility mirror. Canonical membership is in UserFavorite.
      isFavorite: { default: false, type: 'bool' },
      sourceTracks: {
        type: 'linkingObjects',
        objectType: 'SourceTrack',
        property: 'artist',
      },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date;
  musicbrainzId!: string;
  name!: string;
  featured!: number;
  slug!: string;
  sortName!: string;
  popularity?: Popularity;
  featuresRaw!: string;
  upstreamSourcesRaw!: string;
  showCount!: number;
  sourceCount!: number;
  /** @deprecated Use `useFavorite` or `LibraryIndex` for active-account membership. */
  isFavorite!: boolean;
  sourceTracks!: Realm.List<SourceTrack>;

  isAutomaticallyCreated() {
    return (this.featured & ArtistFeaturedFlags.AutoCreated) !== 0;
  }

  isFeatured(): boolean {
    return (this.featured & ArtistFeaturedFlags.Featured) !== 0;
  }

  private _features?: Features;
  features(): Features {
    if (!this._features) {
      this._features = JSON.parse(this.featuresRaw);
    }
    return this._features as Features;
  }

  private _upstreamSources?: StoredArtistUpstreamSource[];
  upstreamSources(): StoredArtistUpstreamSource[] {
    if (!this._upstreamSources) {
      this._upstreamSources = JSON.parse(this.upstreamSourcesRaw);
    }
    return this._upstreamSources!;
  }

  hasOfflineTracks(libraryIndex?: Pick<LibraryIndex, 'artistHasOfflineTracks'>) {
    return libraryIndex
      ? libraryIndex.artistHasOfflineTracks(this.uuid)
      : checkIfOfflineSourceTrackExists(this.sourceTracks);
  }
}
