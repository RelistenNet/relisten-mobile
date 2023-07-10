import dayjs from 'dayjs';
import { FlacType, Link, SourceFull } from '../../api/models/source';
import Realm from 'realm';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { FavoritableObject } from '../favoritable_object';
import type { SourceSet } from './source_set';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SourceRequiredRelationships {
  // sourceSets: Realm.List<SourceSet>;
}

export interface SourceRequiredProperties extends RelistenObjectRequiredProperties {
  artistUuid: string;
  venueUuid?: string;
  displayDate: Date;
  isSoundboard: boolean;
  isRemaster: boolean;
  hasJamcharts: boolean;
  avgRating: number;
  numReviews: number;
  numRatings?: number;
  avgRatingWeighted: number;
  duration?: number;
  upstreamIdentifier: string;
  showUuid: string;
  description?: string;
  taperNotes?: string;
  source?: string;
  taper?: string;
  transferrer?: string;
  lineage?: string;
  flacType: FlacType;
  reviewCount: number;
  linksRaw: string;
}

export class Source
  extends Realm.Object<Source, keyof SourceRequiredProperties & keyof SourceRequiredRelationships>
  implements SourceRequiredRelationships, SourceRequiredProperties, FavoritableObject
{
  static schema: Realm.ObjectSchema = {
    name: 'Source',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      artistUuid: { type: 'string', indexed: true },
      showUuid: { type: 'string', indexed: true },
      venueUuid: { type: 'string?', indexed: true },

      displayDate: 'date',
      isSoundboard: { type: 'bool', indexed: true },
      isRemaster: { type: 'bool', indexed: true },
      hasJamcharts: 'bool',
      avgRating: 'float',
      numReviews: 'int',
      numRatings: 'int?',
      avgRatingWeighted: 'float',
      duration: 'double?',
      upstreamIdentifier: 'string',
      description: 'string?',
      taperNotes: 'string?',
      source: 'string?',
      taper: 'string?',
      transferrer: 'string?',
      lineage: 'string?',
      flacType: 'string',
      reviewCount: 'int',
      linksRaw: 'string',

      sourceSets: 'SourceSet[]',

      isFavorite: { type: 'bool', default: false },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  artistUuid!: string;
  venueUuid?: string;
  displayDate!: Date;
  isSoundboard!: boolean;
  isRemaster!: boolean;
  hasJamcharts!: boolean;
  avgRating!: number;
  numReviews!: number;
  numRatings?: number;
  avgRatingWeighted!: number;
  duration?: number;
  upstreamIdentifier!: string;
  showUuid!: string;
  description?: string;
  taperNotes?: string;
  source?: string;
  taper?: string;
  transferrer?: string;
  lineage?: string;
  flacType!: FlacType;
  reviewCount!: number;
  linksRaw!: string;

  isFavorite!: boolean;

  sourceSets!: Realm.List<SourceSet>;

  private _links?: Link[];
  links() {
    if (!this._links) {
      this._links = JSON.parse(this.linksRaw);
    }
    return this._links!;
  }

  private _humanizedDuration?: string;
  humanizedDuration() {
    if (!this._humanizedDuration && this.duration) {
      this._humanizedDuration = dayjs.duration(this.duration, 'seconds').format('HH:mm:ss');
    }

    return this._humanizedDuration;
  }

  humanizedAvgRating() {
    return this.avgRating.toFixed(2);
  }

  static propertiesFromApi(relistenObj: SourceFull): SourceRequiredProperties {
    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      artistUuid: relistenObj.artist_uuid,
      venueUuid: relistenObj.venue_uuid || undefined,
      showUuid: relistenObj.show_uuid,

      displayDate: dayjs(relistenObj.display_date).toDate(),
      isSoundboard: relistenObj.is_soundboard,
      isRemaster: relistenObj.is_remaster,
      hasJamcharts: relistenObj.has_jamcharts,
      avgRating: relistenObj.avg_rating,
      numReviews: relistenObj.num_reviews,
      numRatings: relistenObj.num_ratings,
      avgRatingWeighted: relistenObj.avg_rating_weighted,
      duration: relistenObj.duration,
      upstreamIdentifier: relistenObj.upstream_identifier,
      description: relistenObj.description,
      taperNotes: relistenObj.taper_notes,
      source: relistenObj.source,
      taper: relistenObj.taper,
      transferrer: relistenObj.transferrer,
      lineage: relistenObj.lineage,
      flacType: relistenObj.flac_type,
      reviewCount: relistenObj.review_count,
      linksRaw: JSON.stringify(relistenObj.links),
    };
  }
}
