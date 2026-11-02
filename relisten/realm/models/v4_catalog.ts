import Realm from 'realm';

import type { Artist } from './artist';
import type { Show } from './show';
import type { SourceTrack } from './source_track';

export class NormalizedVenueName extends Realm.Object<NormalizedVenueName> {
  static schema: Realm.ObjectSchema = {
    name: 'NormalizedVenueName',
    embedded: true,
    properties: {
      name: 'string',
      kind: 'string',
    },
  };

  name!: string;
  kind!: string;
}

/** Shared canonical venue metadata. Imported Venue rows remain separate display facts. */
export class NormalizedVenue extends Realm.Object<NormalizedVenue> {
  static schema: Realm.ObjectSchema = {
    name: 'NormalizedVenue',
    primaryKey: 'id',
    properties: {
      id: 'string',
      globalShowCount: 'int',
      name: 'string',
      kind: 'string',
      parentId: 'string?',
      city: 'string?',
      region: 'string?',
      country: 'string?',
      latitude: 'double?',
      longitude: 'double?',
      coordinatePrecision: 'string?',
      names: 'NormalizedVenueName[]',
    },
  };

  id!: string;
  globalShowCount!: number;
  name!: string;
  kind!: string;
  parentId?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  coordinatePrecision?: string;
  names!: Realm.List<NormalizedVenueName>;
}

/** One server-owned artist/canonical-venue relationship. */
export class ArtistVenue extends Realm.Object<ArtistVenue> {
  static schema: Realm.ObjectSchema = {
    name: 'ArtistVenue',
    primaryKey: 'id',
    properties: {
      id: 'string',
      artistUuid: { type: 'string', indexed: true },
      venueId: { type: 'string', indexed: true },
      artistShowCount: 'int',
      createdAt: 'date',
      updatedAt: 'date',
      artist: 'Artist?',
      venue: 'NormalizedVenue',
    },
  };

  id!: string;
  artistUuid!: string;
  venueId!: string;
  artistShowCount!: number;
  createdAt!: Date;
  updatedAt!: Date;
  artist?: Artist;
  venue!: NormalizedVenue;
}

/** Canonical song metadata; nullable detail fields survive shallow track references. */
export class NormalizedSong extends Realm.Object<NormalizedSong> {
  static schema: Realm.ObjectSchema = {
    name: 'NormalizedSong',
    primaryKey: 'id',
    properties: {
      id: 'string',
      artistUuid: { type: 'string', indexed: true },
      name: 'string',
      kind: 'string?',
      slug: 'string?',
      originalArtist: 'string?',
      aliases: 'string[]',
      matchedTrackCount: 'int?',
      matchedShowCount: 'int?',
      artist: 'Artist?',
      shows: 'Show[]',
      tracks: 'SourceTrack[]',
    },
  };

  id!: string;
  artistUuid!: string;
  name!: string;
  kind?: string;
  slug?: string;
  originalArtist?: string;
  aliases!: Realm.List<string>;
  matchedTrackCount?: number;
  matchedShowCount?: number;
  artist?: Artist;
  shows!: Realm.List<Show>;
  tracks!: Realm.List<SourceTrack>;
}

export class TrackNormalizationPart extends Realm.Object<TrackNormalizationPart> {
  static schema: Realm.ObjectSchema = {
    name: 'TrackNormalizationPart',
    embedded: true,
    properties: {
      ordinal: 'int',
      text: 'string?',
      state: 'string',
      qualifiers: 'string[]',
      notes: 'string[]',
      segueAfter: 'bool',
      song: 'NormalizedSong?',
    },
  };

  ordinal!: number;
  text?: string;
  state!: string;
  qualifiers!: Realm.List<string>;
  notes!: Realm.List<string>;
  segueAfter!: boolean;
  song?: NormalizedSong;
}

/** One complete ordered interpretation for one playable SourceTrack. */
export class TrackNormalization extends Realm.Object<TrackNormalization> {
  static schema: Realm.ObjectSchema = {
    name: 'TrackNormalization',
    embedded: true,
    properties: {
      state: 'string',
      reason: 'string?',
      parts: 'TrackNormalizationPart[]',
    },
  };

  state!: string;
  reason?: string;
  parts!: Realm.List<TrackNormalizationPart>;
}

/** Applied HTTP validator and exact result order for one endpoint/filter query. */
export class CatalogQueryState extends Realm.Object<CatalogQueryState> {
  static schema: Realm.ObjectSchema = {
    name: 'CatalogQueryState',
    primaryKey: 'key',
    properties: {
      key: 'string',
      etag: 'string?',
      hasAppliedData: { type: 'bool', default: false },
      lastAppliedAt: 'date?',
      lastCheckedAt: 'date?',
      retryPending: { type: 'bool', default: false },
      resultIds: 'string[]',
    },
  };

  key!: string;
  etag?: string;
  hasAppliedData!: boolean;
  lastAppliedAt?: Date;
  lastCheckedAt?: Date;
  retryPending!: boolean;
  resultIds!: Realm.List<string>;
}

export const V4_CATALOG_REALM_MODELS = [
  NormalizedVenueName,
  NormalizedVenue,
  ArtistVenue,
  NormalizedSong,
  TrackNormalizationPart,
  TrackNormalization,
  CatalogQueryState,
];
