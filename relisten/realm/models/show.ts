import dayjs from 'dayjs';
import { Show as ApiShow } from '../../api/models/show';
import Realm from 'realm';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { FavoritableObject } from '../favoritable_object';
import { Venue } from './venue';
import { SourceTrack } from './source_track';
import { checkIfOfflineSourceTrackExists } from '../realm_filters';
import { Tour } from './tour';
import { Artist } from './artist';
import { duration } from '@/relisten/util/duration';
import type { Song } from '@/relisten/realm/models/song';
import { Popularity } from './popularity';

export interface ShowRequiredProperties extends RelistenObjectRequiredProperties {
  artistUuid: string;
  yearUuid: string;
  venueUuid?: string;
  tourUuid?: string;
  createdAt: Date;
  date: Date;
  avgRating: number;
  avgDuration?: number;
  displayDate: string;
  mostRecentSourceUpdatedAt: Date;
  hasSoundboardSource: boolean;
  hasStreamableFlacSource: boolean;
  sourceCount: number;
  popularity?: Popularity;
}

export class Show
  extends Realm.Object<Show, keyof ShowRequiredProperties>
  implements ShowRequiredProperties, FavoritableObject
{
  static schema: Realm.ObjectSchema = {
    name: 'Show',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      artistUuid: { type: 'string', indexed: true },
      yearUuid: { type: 'string', indexed: true },
      venueUuid: { type: 'string', optional: true, indexed: true },
      tourUuid: { type: 'string', optional: true, indexed: true },
      createdAt: 'date',
      updatedAt: 'date',
      date: { type: 'date', indexed: true },
      avgRating: 'float',
      avgDuration: 'float?',
      displayDate: 'string',
      mostRecentSourceUpdatedAt: 'date',
      hasSoundboardSource: 'bool',
      hasStreamableFlacSource: 'bool',
      sourceCount: 'int',
      popularity: 'Popularity?',
      isFavorite: { type: 'bool', default: false },
      venue: 'Venue?',
      sourceTracks: {
        type: 'linkingObjects',
        objectType: 'SourceTrack',
        property: 'show',
      },
      songs: {
        type: 'linkingObjects',
        objectType: 'Song',
        property: 'shows',
      },
      tour: 'Tour?',
      artist: 'Artist?',
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  artistUuid!: string;
  yearUuid!: string;
  venueUuid?: string;
  tourUuid?: string;
  date!: Date;
  avgRating!: number;
  avgDuration?: number;
  displayDate!: string;
  mostRecentSourceUpdatedAt!: Date;
  hasSoundboardSource!: boolean;
  hasStreamableFlacSource!: boolean;
  sourceCount!: number;
  popularity?: Popularity;

  venue?: Venue;
  sourceTracks!: Realm.List<SourceTrack>;
  songs!: Realm.Set<Song>;
  artist!: Artist;
  tour?: Tour;

  isFavorite!: boolean;

  private _humanizedAvgDuration?: string;
  humanizedAvgDuration() {
    if (!this._humanizedAvgDuration && this.avgDuration) {
      this._humanizedAvgDuration = duration(this.avgDuration);
    }

    return this._humanizedAvgDuration;
  }

  humanizedAvgRating() {
    return this.avgRating.toFixed(2);
  }

  get hasOfflineTracks() {
    return checkIfOfflineSourceTrackExists(this.sourceTracks);
  }

  static propertiesFromApi(relistenObj: ApiShow): ShowRequiredProperties {
    const popularity = relistenObj.popularity;
    const windows = popularity?.windows;
    const window48h = windows?.['48h'];
    const window7d = windows?.['7d'];
    const window30d = windows?.['30d'];

    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      artistUuid: relistenObj.artist_uuid,
      venueUuid: relistenObj.venue_uuid || undefined,
      tourUuid: relistenObj.tour_uuid || undefined,
      yearUuid: relistenObj.year_uuid,
      date: dayjs(relistenObj.date).toDate(),
      avgRating: relistenObj.avg_rating,
      avgDuration: relistenObj.avg_duration || undefined,
      displayDate: relistenObj.display_date,
      mostRecentSourceUpdatedAt: dayjs(relistenObj.most_recent_source_updated_at).toDate(),
      hasSoundboardSource: relistenObj.has_soundboard_source,
      hasStreamableFlacSource: relistenObj.has_streamable_flac_source,
      sourceCount: relistenObj.source_count,
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

  static shouldUpdateFromApi(model: Show, relistenObj: ApiShow): boolean {
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
