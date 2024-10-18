import dayjs from 'dayjs';
import Realm from 'realm';
import { ArtistUpstreamSource, ArtistWithCounts, Features } from '../../api/models/artist';
import { FavoritableObject } from '../favoritable_object';
import { checkIfOfflineSourceTrackExists } from '../realm_filters';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { SourceTrack } from './source_track';

export interface ArtistRequiredRelationships {}

export interface ArtistRequiredProperties extends RelistenObjectRequiredProperties {
  musicbrainzId: string;
  name: string;
  featured: Realm.Types.Int;
  slug: string;
  sortName: string;
  featuresRaw: string;
  upstreamSourcesRaw: string;
  showCount: Realm.Types.Int;
  sourceCount: Realm.Types.Int;
}

export class Artist
  extends Realm.Object<Artist, keyof ArtistRequiredProperties & keyof ArtistRequiredRelationships>
  implements ArtistRequiredRelationships, ArtistRequiredProperties, FavoritableObject
{
  static schema: Realm.ObjectSchema = {
    name: 'Artist',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      musicbrainzId: 'string',
      name: 'string',
      featured: 'int',
      slug: 'string',
      sortName: 'string',
      featuresRaw: 'string',
      upstreamSourcesRaw: 'string',
      showCount: 'int',
      sourceCount: 'int',
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
  musicbrainzId!: string;
  name!: string;
  featured!: number;
  slug!: string;
  sortName!: string;
  featuresRaw!: string;
  upstreamSourcesRaw!: string;
  showCount!: number;
  sourceCount!: number;
  isFavorite!: boolean;
  sourceTracks!: Realm.List<SourceTrack>;

  private _features?: Features;
  features() {
    if (!this._features) {
      this._features = JSON.parse(this.featuresRaw);
    }
    return this._features;
  }

  private _upstreamSources?: ArtistUpstreamSource[];
  upstreamSources() {
    if (!this._upstreamSources) {
      this._upstreamSources = JSON.parse(this.upstreamSourcesRaw);
    }
    return this._upstreamSources;
  }

  get hasOfflineTracks() {
    return checkIfOfflineSourceTrackExists(this.sourceTracks);
  }

  static propertiesFromApi(relistenObj: ArtistWithCounts): ArtistRequiredProperties {
    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      musicbrainzId: relistenObj.musicbrainz_id,
      name: relistenObj.name,
      featured: relistenObj.featured,
      slug: relistenObj.slug,
      sortName: relistenObj.sort_name,
      featuresRaw: JSON.stringify(relistenObj.features),
      upstreamSourcesRaw: JSON.stringify(relistenObj.upstream_sources),
      showCount: relistenObj.show_count,
      sourceCount: relistenObj.source_count,
    };
  }
}
