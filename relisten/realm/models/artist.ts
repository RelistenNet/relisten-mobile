import dayjs from 'dayjs';
import Realm from 'realm';
import { ArtistUpstreamSource, ArtistWithCounts, Features } from '../../api/models/artist';
import { FavoritableObject } from '../favoritable_object';
import { checkIfOfflineSourceTrackExists } from '../realm_filters';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { SourceTrack } from './source_track';
import { Popularity } from './popularity';

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
  implements ArtistRequiredProperties, FavoritableObject
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
      popularity: 'Popularity?',
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
  popularity?: Popularity;
  featuresRaw!: string;
  upstreamSourcesRaw!: string;
  showCount!: number;
  sourceCount!: number;
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
    const popularity = relistenObj.popularity;
    const windows = popularity?.windows;
    const window48h = windows?.['48h'];
    const window7d = windows?.['7d'];
    const window30d = windows?.['30d'];
    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      musicbrainzId: relistenObj.musicbrainz_id,
      name: relistenObj.name,
      featured: relistenObj.featured,
      slug: relistenObj.slug,
      sortName: relistenObj.sort_name,
      popularity: popularity
        ? ({
            momentumScore: popularity.momentum_score,
            trendRatio: popularity.trend_ratio,
            windows: {
              hours48h: {
                plays: window48h?.plays ?? 0,
                hours: window48h?.hours ?? 0,
                hotScore: window48h?.hot_score ?? 0,
              },
              days7d: {
                plays: window7d?.plays ?? 0,
                hours: window7d?.hours ?? 0,
                hotScore: window7d?.hot_score ?? 0,
              },
              days30d: {
                plays: window30d?.plays ?? 0,
                hours: window30d?.hours ?? 0,
                hotScore: window30d?.hot_score ?? 0,
              },
            },
          } as Popularity)
        : undefined,
      featuresRaw: JSON.stringify(relistenObj.features),
      upstreamSourcesRaw: JSON.stringify(relistenObj.upstream_sources),
      showCount: relistenObj.show_count,
      sourceCount: relistenObj.source_count,
    };
  }

  static shouldUpdateFromApi(model: Artist, relistenObj: ArtistWithCounts): boolean {
    const popularity = relistenObj.popularity;
    const windows = popularity?.windows;
    const window48h = windows?.['48h'];
    const window7d = windows?.['7d'];
    const window30d = windows?.['30d'];

    if (!popularity) {
      return false;
    }

    if (!model.popularity) {
      return true;
    }

    return (
      model.popularity.momentumScore !== popularity.momentum_score ||
      model.popularity.trendRatio !== popularity.trend_ratio ||
      model.popularity.windows.hours48h.plays !== (window48h?.plays ?? 0) ||
      model.popularity.windows.hours48h.hours !== (window48h?.hours ?? 0) ||
      model.popularity.windows.hours48h.hotScore !== (window48h?.hot_score ?? 0) ||
      model.popularity.windows.days7d.plays !== (window7d?.plays ?? 0) ||
      model.popularity.windows.days7d.hours !== (window7d?.hours ?? 0) ||
      model.popularity.windows.days7d.hotScore !== (window7d?.hot_score ?? 0) ||
      model.popularity.windows.days30d.plays !== (window30d?.plays ?? 0) ||
      model.popularity.windows.days30d.hours !== (window30d?.hours ?? 0) ||
      model.popularity.windows.days30d.hotScore !== (window30d?.hot_score ?? 0)
    );
  }
}
