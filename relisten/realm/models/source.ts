import dayjs from 'dayjs';
import { FlacType, Link, SourceFull } from '../../api/models/source';
import Realm from 'realm';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { FavoritableObject } from '../favoritable_object';
import type { SourceSet } from './source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Artist } from '@/relisten/realm/models/artist';
import { duration } from '@/relisten/util/duration';
import { checkIfOfflineSourceTrackExists } from '@/relisten/realm/realm_filters';
import type { LibraryIndex } from '@/relisten/realm/library_index';

export interface SourceRequiredProperties extends RelistenObjectRequiredProperties {
  artistUuid: string;
  venueUuid?: string;
  displayDate: string;
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
  extends Realm.Object<Source, keyof SourceRequiredProperties>
  implements SourceRequiredProperties, FavoritableObject
{
  static schema: Realm.ObjectSchema = {
    name: 'Source',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: { type: 'date', optional: true, indexed: true },
      artistUuid: { type: 'string', indexed: true },
      showUuid: { type: 'string', indexed: true },
      venueUuid: { type: 'string', optional: true, indexed: true },

      displayDate: 'string',
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
      sourceTracks: {
        type: 'linkingObjects',
        objectType: 'SourceTrack',
        property: 'source',
      },
      artist: 'Artist?',

      isFavorite: { type: 'bool', default: false },
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date;
  artistUuid!: string;
  venueUuid?: string;
  displayDate!: string;
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
  sourceTracks!: Realm.List<SourceTrack>;
  artist!: Artist;

  private _links?: Link[];
  private _cachedLinksRaw?: string;
  links() {
    if (!this._links || this._cachedLinksRaw !== this.linksRaw) {
      this._links = JSON.parse(this.linksRaw);
      this._cachedLinksRaw = this.linksRaw;
    }
    return this._links!;
  }

  private _humanizedDuration?: string;
  humanizedDuration() {
    if (!this._humanizedDuration && this.duration) {
      this._humanizedDuration = duration(this.duration);
    }

    return this._humanizedDuration;
  }

  humanizedAvgRating() {
    return this.avgRating.toFixed(2);
  }

  allSourceTracks() {
    const sortedSets = Array.from(this.sourceSets).sort((a, b) => a.index - b.index);

    const tracks: SourceTrack[] = [];

    for (const set of sortedSets) {
      const sortedTracks = Array.from(set.sourceTracks).sort(
        (a, b) => a.trackPosition - b.trackPosition
      );
      for (const track of sortedTracks) {
        tracks.push(track);
      }
    }

    return tracks;
  }

  hasOfflineTracks(libraryIndex?: Pick<LibraryIndex, 'sourceHasOfflineTracks'>) {
    return libraryIndex
      ? libraryIndex.sourceHasOfflineTracks(this.uuid)
      : checkIfOfflineSourceTrackExists(this.sourceTracks);
  }

  static propertiesFromApi(relistenObj: SourceFull): SourceRequiredProperties {
    return {
      uuid: relistenObj.uuid,
      createdAt: dayjs(relistenObj.created_at).toDate(),
      updatedAt: dayjs(relistenObj.updated_at).toDate(),
      artistUuid: relistenObj.artist_uuid,
      venueUuid: relistenObj.venue_uuid || undefined,
      showUuid: relistenObj.show_uuid,

      displayDate: relistenObj.display_date,
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

  static shouldUpdateFromApi(model: Source, relistenObj: SourceFull) {
    // A resolver-hydrated source has the catalog's current updated_at but an
    // intentionally empty link sidecar. Let the ordinary full-show response
    // enrich it even when the underlying source timestamp has not changed.
    return model.linksRaw !== JSON.stringify(relistenObj.links);
  }
}
