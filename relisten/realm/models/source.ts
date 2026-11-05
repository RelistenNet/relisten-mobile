import Realm from 'realm';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { LegacyFavoriteMirror } from '../legacy_favorite_mirror';
import type { SourceSet } from './source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Artist } from '@/relisten/realm/models/artist';
import { duration } from '@/relisten/util/duration';
import { checkIfOfflineSourceTrackExists } from '@/relisten/realm/realm_filters';
import type { LibraryIndex } from '@/relisten/realm/library_index';

/** Stored links use numeric upstream IDs or provider names, depending on their source format. */
export interface Link {
  created_at: string;
  updated_at: string;
  source_id: number | string;
  upstream_source_id?: number;
  provider?: string;
  for_reviews: boolean;
  for_ratings: boolean;
  for_source: boolean;
  url: string;
  label: string;
}

export enum FlacType {
  NoFlac = 'NoFlac',
  Flac16Bit = 'Flac16Bit',
  Flac24Bit = 'Flac24Bit',
  NoPlayableFlac = 'NoPlayableFlac',
  Unknown = 'Unknown',
}

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
  implements SourceRequiredProperties, LegacyFavoriteMirror
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

      // Deprecated compatibility mirror. Canonical membership is in UserFavorite.
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

  /** @deprecated Use `useFavorite` or `LibraryIndex` for active-account membership. */
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
}
