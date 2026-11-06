import Realm from 'realm';

import type { Artist } from './artist';

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
      deletedAt: { type: 'date', optional: true, indexed: true },
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
  deletedAt?: Date;
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
      deletedAt: { type: 'date', optional: true, indexed: true },
      artistUuid: { type: 'string', indexed: true },
      name: 'string',
      kind: 'string?',
      slug: 'string?',
      originalArtist: 'string?',
      aliases: 'string[]',
      matchedTrackCount: 'int?',
      matchedShowCount: 'int?',
      artist: 'Artist?',
    },
  };

  id!: string;
  deletedAt?: Date;
  artistUuid!: string;
  name!: string;
  kind?: string;
  slug?: string;
  originalArtist?: string;
  aliases!: Realm.List<string>;
  matchedTrackCount?: number;
  matchedShowCount?: number;
  artist?: Artist;
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

/** Catalog merges are independent of accounts and saved favorite identities. */
export class CatalogRedirect extends Realm.Object<CatalogRedirect> {
  static schema: Realm.ObjectSchema = {
    name: 'CatalogRedirect',
    primaryKey: 'id',
    properties: { id: 'string', targetId: 'string' },
  };

  id!: string;
  targetId!: string;
}

export const CATALOG_REALM_MODELS = [
  CatalogRedirect,
  NormalizedVenueName,
  NormalizedVenue,
  ArtistVenue,
  NormalizedSong,
  TrackNormalizationPart,
  TrackNormalization,
];
