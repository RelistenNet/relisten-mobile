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

export interface ShowRequiredRelationships {}

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
}

export class Show
  extends Realm.Object<Show, keyof ShowRequiredProperties & keyof ShowRequiredRelationships>
  implements ShowRequiredRelationships, ShowRequiredProperties, FavoritableObject
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
    };
  }
}
