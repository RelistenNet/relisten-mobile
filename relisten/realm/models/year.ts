import dayjs from 'dayjs';
import Realm from 'realm';
import { Year as ApiYear } from '../../api/models/year';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { checkIfOfflineSourceTrackExists } from '../realm_filters';
import { SourceTrack } from './source_track';
import { Popularity } from './popularity';

export interface YearRequiredProperties extends RelistenObjectRequiredProperties {
  artistUuid: string;
  showCount: Realm.Types.Int;
  sourceCount: Realm.Types.Int;
  duration?: Realm.Types.Float;
  avgDuration?: Realm.Types.Float;
  avgRating?: Realm.Types.Float;
  year: string;
  popularity?: Popularity;
}

export class Year
  extends Realm.Object<Year, keyof YearRequiredProperties>
  implements YearRequiredProperties
{
  static schema: Realm.ObjectSchema = {
    name: 'Year',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      artistUuid: { type: 'string', indexed: true },
      showCount: 'int',
      sourceCount: 'int',
      duration: 'double?',
      avgDuration: 'double?',
      avgRating: 'double?',
      year: 'string',
      popularity: 'Popularity?',
      // isFavorite: { type: 'bool', default: false },
      sourceTracks: {
        type: 'linkingObjects',
        objectType: 'SourceTrack',
        property: 'year',
      },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  artistUuid!: string;
  showCount!: Realm.Types.Int;
  sourceCount!: Realm.Types.Int;
  duration?: Realm.Types.Float;
  avgDuration?: Realm.Types.Float;
  avgRating?: Realm.Types.Float;
  year!: string;
  popularity?: Popularity;
  // isFavorite!: boolean;

  sourceTracks!: Realm.List<SourceTrack>;

  get hasOfflineTracks() {
    return checkIfOfflineSourceTrackExists(this.sourceTracks);
  }

  static propertiesFromApi(relistenObj: ApiYear): YearRequiredProperties {
    const popularity = relistenObj.popularity;
    const windows = popularity?.windows;
    const window48h = windows?.['48h'];
    const window7d = windows?.['7d'];
    const window30d = windows?.['30d'];

    return {
      uuid: relistenObj.uuid,
      artistUuid: relistenObj.artist_uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      showCount: relistenObj.show_count,
      sourceCount: relistenObj.source_count,
      duration: relistenObj.duration || undefined,
      avgDuration: relistenObj.avg_duration || undefined,
      avgRating: relistenObj.avg_rating || undefined,
      year: relistenObj.year,
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
    };
  }

  static shouldUpdateFromApi(model: Year, relistenObj: ApiYear): boolean {
    const popularity = relistenObj.popularity;
    const windows = popularity?.windows;
    const window48h = windows?.['48h'];
    const window7d = windows?.['7d'];
    const window30d = windows?.['30d'];

    if (!popularity) {
      return false;
    }

    if (!model.popularity || !model.popularity.windows) {
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
