import Realm from 'realm';
import { RelistenObjectRequiredProperties } from '../relisten_object';
import { LegacyFavoriteMirror } from '../legacy_favorite_mirror';
import { Venue } from './venue';
import { SourceTrack } from './source_track';
import { checkIfOfflineSourceTrackExists } from '../realm_filters';
import { Tour } from './tour';
import { Artist } from './artist';
import { duration } from '@/relisten/util/duration';
import type { Song } from '@/relisten/realm/models/song';
import { Popularity } from './popularity';
import type { LibraryIndex } from '@/relisten/realm/library_index';
import type { ArtistVenue } from '@/relisten/realm/models/catalog';

export interface ShowRequiredProperties extends RelistenObjectRequiredProperties {
  artistUuid: string;
  yearUuid?: string;
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
  implements ShowRequiredProperties, LegacyFavoriteMirror
{
  static schema: Realm.ObjectSchema = {
    name: 'Show',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      artistUuid: { type: 'string', indexed: true },
      yearUuid: { type: 'string', optional: true, indexed: true },
      venueUuid: { type: 'string', optional: true, indexed: true },
      tourUuid: { type: 'string', optional: true, indexed: true },
      createdAt: 'date',
      updatedAt: 'date',
      deletedAt: { type: 'date', optional: true, indexed: true },
      date: { type: 'date', indexed: true },
      avgRating: 'float',
      avgDuration: 'float?',
      displayDate: 'string',
      mostRecentSourceUpdatedAt: 'date',
      hasSoundboardSource: 'bool',
      hasStreamableFlacSource: 'bool',
      sourceCount: 'int',
      popularity: 'Popularity?',
      // Deprecated compatibility mirror. Canonical membership is in UserFavorite.
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
      artistVenue: 'ArtistVenue?',
    },
  };

  uuid!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date;
  artistUuid!: string;
  yearUuid?: string;
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
  artistVenue?: ArtistVenue;

  /** @deprecated Use `useFavorite` or `LibraryIndex` for active-account membership. */
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

  hasOfflineTracks(libraryIndex?: Pick<LibraryIndex, 'showHasOfflineTracks'>) {
    return libraryIndex
      ? libraryIndex.showHasOfflineTracks(this.uuid)
      : checkIfOfflineSourceTrackExists(this.sourceTracks);
  }
}

/** Fields used by show lists, excluding inverse recording/song collections. */
export const SHOW_LIST_KEY_PATHS = [
  'uuid',
  'artistUuid',
  'yearUuid',
  'venueUuid',
  'tourUuid',
  'date',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'avgRating',
  'avgDuration',
  'displayDate',
  'mostRecentSourceUpdatedAt',
  'hasSoundboardSource',
  'hasStreamableFlacSource',
  'sourceCount',
  'popularity',
  'venue.name',
  'venue.location',
  'artist.uuid',
  'artist.name',
  'tour.name',
  'artistVenue.venueId',
];
