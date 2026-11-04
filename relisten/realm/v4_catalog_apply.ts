import type { V4CatalogResolveResponse } from '@/relisten/api/v4/catalog_resolve';
import Realm from 'realm';

import {
  decodeV4UuidCatalogId,
  encodeV4UuidCatalogId,
  retainV4ShortCatalogId,
} from '@/relisten/api/v4/catalog_identity';
import type {
  V4ArtistResource,
  V4ArtistSongEntryResource,
  V4ArtistVenueEntryResource,
  V4ArtistVenueResource,
  V4ArtistVenueWithShowsResource,
  V4ImportedSongResource,
  V4ImportedSongWithShowsResource,
  V4ImportedVenueResource,
  V4ImportedVenueWithShowsResource,
  V4PopularityResource,
  V4PopularityWindowResource,
  V4ShortCatalogPrefix,
  V4ShowResource,
  V4ShowSummaryResource,
  V4SongDetailResource,
  V4SongResource,
  V4SongWithShowsResource,
  V4SongWithTracksResource,
  V4SourceResource,
  V4SourceSetResource,
  V4TourResource,
  V4TourWithShowsResource,
  V4TrackNormalizationResource,
  V4TrackResource,
  V4UuidCatalogPrefix,
  V4VenueResource,
  V4VenueWithShowsResource,
  V4YearResource,
  V4YearWithShowsResource,
} from '@/relisten/api/v4/wire_types';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Tour } from '@/relisten/realm/models/tour';
import {
  ArtistVenue,
  CatalogQueryState,
  NormalizedSong,
  NormalizedVenue,
} from '@/relisten/realm/models/v4_catalog';
import { Venue } from '@/relisten/realm/models/venue';
import { Year } from '@/relisten/realm/models/year';
import type { Popularity, PopularityWindow } from '@/relisten/realm/models/popularity';

export class V4CatalogApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V4CatalogApplyError';
  }
}

function requiredDate(value: string, field: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new V4CatalogApplyError(`Invalid ${field} date: ${value}`);
  }
  return date;
}

function optionalDate(value: string | null, field: string) {
  return value === null ? null : requiredDate(value, field);
}

function popularityProperties(popularity: V4PopularityResource | null) {
  if (!popularity) {
    return null;
  }

  return {
    momentumScore: popularity.momentum_score,
    trendRatio: popularity.trend_ratio,
    windows: {
      hours48h: {
        plays: popularity.windows['48h'].plays,
        hours: popularity.windows['48h'].hours,
        hotScore: popularity.windows['48h'].hot_score,
      },
      days7d: {
        plays: popularity.windows['7d'].plays,
        hours: popularity.windows['7d'].hours,
        hotScore: popularity.windows['7d'].hot_score,
      },
      days30d: {
        plays: popularity.windows['30d'].plays,
        hours: popularity.windows['30d'].hours,
        hotScore: popularity.windows['30d'].hot_score,
      },
    },
  };
}

function popularityWindowChanged(current: PopularityWindow, next: V4PopularityWindowResource) {
  return (
    current.plays !== next.plays ||
    current.hours !== next.hours ||
    current.hotScore !== next.hot_score
  );
}

function popularityChanged(
  current: Popularity | null | undefined,
  next: V4PopularityResource | null
) {
  if (!current || !next) {
    return Boolean(current) !== Boolean(next);
  }
  return (
    current.momentumScore !== next.momentum_score ||
    current.trendRatio !== next.trend_ratio ||
    popularityWindowChanged(current.windows.hours48h, next.windows['48h']) ||
    popularityWindowChanged(current.windows.days7d, next.windows['7d']) ||
    popularityWindowChanged(current.windows.days30d, next.windows['30d'])
  );
}

function requireObject<T extends object>(
  realm: Realm,
  type: { schema: Realm.ObjectSchema; prototype: T },
  primaryKey: string,
  description: string
): T {
  const object = realm.objectForPrimaryKey(
    type.schema.name,
    primaryKey as never
  ) as unknown as T | null;
  if (!object) {
    throw new V4CatalogApplyError(`Missing ${description} ${primaryKey}.`);
  }
  return object as T;
}

function requireMatchingArtist(
  resourceArtistUuid: string,
  expectedArtistUuid: string,
  description: string
) {
  if (resourceArtistUuid !== expectedArtistUuid) {
    throw new V4CatalogApplyError(`${description} has an inconsistent artist parent.`);
  }
}

function requireUniqueIds(ids: string[], description: string) {
  if (new Set(ids).size !== ids.length) {
    throw new V4CatalogApplyError(`${description} contains duplicate identities.`);
  }
}

function deleteQueryState(realm: Realm, queryKey: string) {
  const state = realm.objectForPrimaryKey(CatalogQueryState, queryKey);
  if (state) {
    realm.delete(state);
  }
}

function invalidateQueryValidator(realm: Realm, queryKey: string) {
  const state = realm.objectForPrimaryKey(CatalogQueryState, queryKey);
  if (!state) {
    return;
  }
  state.etag = undefined;
  state.lastCheckedAt = undefined;
}

function invalidateArtistVenueValidator(realm: Realm, artistUuid: string, venueId: string) {
  const artistId = encodeV4UuidCatalogId(artistUuid, 'artist');
  invalidateQueryValidator(realm, `GET /artists/${artistId}/venues/${venueId}`);
}

function invalidateSongValidators(realm: Realm, songId: string) {
  invalidateQueryValidator(realm, `GET /songs/${songId}`);
  invalidateQueryValidator(realm, `GET /songs/${songId}/tracks`);
}

function invalidateYearValidators(realm: Realm, artistUuid: string, yearUuid: string) {
  const artistPath = `/artists/${encodeV4UuidCatalogId(artistUuid, 'artist')}`;
  invalidateQueryValidator(realm, `GET ${artistPath}/years`);
  invalidateQueryValidator(
    realm,
    `GET ${artistPath}/years/${encodeV4UuidCatalogId(yearUuid, 'year')}`
  );

  // Show responses and show collections embed this year. Their stored membership
  // identifies the affected responses without retaining DTOs or a dependency table.
  // Recording details use raw UUIDs; song/venue/tour collections use typed show IDs.
  const showIds = realm
    .objects(Show)
    .filtered('yearUuid == $0', yearUuid)
    .flatMap((show) => [show.uuid, encodeV4UuidCatalogId(show.uuid, 'show')]);
  if (showIds.length > 0) {
    for (const query of realm.objects(CatalogQueryState).filtered('ANY resultIds IN $0', showIds)) {
      invalidateQueryValidator(realm, query.key);
    }
  }
}

function sameStrings(actual: Iterable<string>, expected: string[]) {
  const values = Array.from(actual);
  return (
    values.length === expected.length && values.every((value, index) => value === expected[index])
  );
}

function normalizedVenueMetadataChanged(
  venue: NormalizedVenue | null,
  resource: V4VenueResource,
  parentId: string | undefined
) {
  return (
    !venue ||
    venue.globalShowCount !== resource.global_show_count ||
    venue.name !== resource.name ||
    venue.kind !== resource.kind ||
    (venue.parentId ?? null) !== (parentId ?? null) ||
    (venue.city ?? null) !== resource.city ||
    (venue.region ?? null) !== resource.region ||
    (venue.country ?? null) !== resource.country ||
    (venue.latitude ?? null) !== resource.latitude ||
    (venue.longitude ?? null) !== resource.longitude ||
    (venue.coordinatePrecision ?? null) !== resource.coordinate_precision ||
    venue.names.length !== resource.names.length ||
    venue.names.some(
      (name, index) =>
        name.name !== resource.names[index].name || name.kind !== resource.names[index].kind
    )
  );
}

function normalizedSongReferenceChanged(
  song: NormalizedSong | null,
  resource: V4SongResource,
  artistUuid: string
) {
  return (
    !song ||
    song.artistUuid !== artistUuid ||
    song.artist?.uuid !== artistUuid ||
    song.name !== resource.name ||
    (song.kind ?? null) !== resource.kind
  );
}

function normalizedSongDetailChanged(song: NormalizedSong | null, resource: V4SongDetailResource) {
  return (
    !song ||
    song.slug !== resource.slug ||
    (song.originalArtist ?? null) !== resource.original_artist ||
    !sameStrings(song.aliases, resource.aliases) ||
    song.matchedTrackCount !== resource.matched_track_count ||
    song.matchedShowCount !== resource.matched_show_count
  );
}

function reconcileExactMembership<T extends { uuid: string }>(
  existingRows: Iterable<T & { deletedAt?: Date }>,
  returnedRows: readonly T[],
  description: string,
  tombstoneAt: Date
) {
  const returnedIds = returnedRows.map((row) => row.uuid);
  requireUniqueIds(returnedIds, description);
  const returnedIdSet = new Set(returnedIds);
  for (const row of existingRows) {
    if (!returnedIdSet.has(row.uuid) && row.deletedAt == null) {
      row.deletedAt = tombstoneAt;
    }
  }
  return returnedIds;
}

function removeTrackFromSet(sourceSet: SourceSet, trackUuid: string) {
  for (let index = sourceSet.sourceTracks.length - 1; index >= 0; index -= 1) {
    if (sourceSet.sourceTracks[index].uuid === trackUuid) {
      sourceSet.sourceTracks.splice(index, 1);
    }
  }
}

function reconcileTrackMembership(realm: Realm, track: SourceTrack, targetSet: SourceSet) {
  const linkedSets = realm.objects(SourceSet).filtered('ANY sourceTracks.uuid == $0', track.uuid);
  for (const sourceSet of Array.from(linkedSets)) {
    if (sourceSet.uuid !== targetSet.uuid) {
      removeTrackFromSet(sourceSet, track.uuid);
    }
  }

  if (!targetSet.sourceTracks.some((candidate) => candidate.uuid === track.uuid)) {
    const orderedTracks = [...targetSet.sourceTracks, track].sort(
      (left, right) => left.trackPosition - right.trackPosition
    );
    targetSet.sourceTracks.splice(0, targetSet.sourceTracks.length, ...orderedTracks);
  }
}

function removeSetFromSource(source: Source, sourceSetUuid: string) {
  for (let index = source.sourceSets.length - 1; index >= 0; index -= 1) {
    if (source.sourceSets[index].uuid === sourceSetUuid) {
      source.sourceSets.splice(index, 1);
    }
  }
}

function reconcileSourceSetMembership(realm: Realm, sourceSet: SourceSet, targetSource: Source) {
  const linkedSources = realm.objects(Source).filtered('ANY sourceSets.uuid == $0', sourceSet.uuid);
  for (const source of Array.from(linkedSources)) {
    if (source.uuid !== targetSource.uuid) {
      removeSetFromSource(source, sourceSet.uuid);
    }
  }

  if (!targetSource.sourceSets.some((candidate) => candidate.uuid === sourceSet.uuid)) {
    const orderedSets = [...targetSource.sourceSets, sourceSet].sort(
      (left, right) => left.index - right.index
    );
    targetSource.sourceSets.splice(0, targetSource.sourceSets.length, ...orderedSets);
  }
}

function applyArtist(realm: Realm, resource: V4ArtistResource) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'artist');
  const current = realm.objectForPrimaryKey(Artist, uuid);
  if (current && popularityChanged(current.popularity, resource.popularity)) {
    invalidateQueryValidator(realm, 'GET /artists?include_autocreated=true');
  }
  return realm.create(
    Artist,
    {
      uuid,
      createdAt: requiredDate(resource.created_at, 'artist.created_at'),
      updatedAt: requiredDate(resource.updated_at, 'artist.updated_at'),
      deletedAt: null,
      musicbrainzId: resource.musicbrainz_id ?? '',
      name: resource.name,
      featured: resource.featured,
      slug: resource.slug,
      sortName: resource.sort_name ?? resource.name,
      featuresRaw: JSON.stringify(resource.features),
      upstreamSourcesRaw: JSON.stringify(resource.upstream_sources),
      popularity: popularityProperties(resource.popularity),
      showCount: resource.show_count,
      sourceCount: resource.source_count,
    } as unknown as Realm.Unmanaged<Artist>,
    Realm.UpdateMode.Modified
  );
}

function applyYear(realm: Realm, resource: V4YearResource) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'year');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const current = realm.objectForPrimaryKey(Year, uuid);
  if (current && popularityChanged(current.popularity, resource.popularity)) {
    invalidateYearValidators(realm, artistUuid, uuid);
  }
  return realm.create(
    Year,
    {
      uuid,
      artistUuid,
      createdAt: requiredDate(resource.created_at, 'year.created_at'),
      updatedAt: requiredDate(resource.updated_at, 'year.updated_at'),
      deletedAt: null,
      showCount: resource.show_count,
      sourceCount: resource.source_count,
      duration: resource.duration,
      avgDuration: resource.avg_duration,
      avgRating: resource.avg_rating,
      year: resource.year,
      popularity: popularityProperties(resource.popularity),
    } as unknown as Realm.Unmanaged<Year>,
    Realm.UpdateMode.Modified
  );
}

function applyTour(realm: Realm, resource: V4TourResource) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'tour');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const createdAt = requiredDate(resource.created_at, 'tour.created_at');
  const updatedAt = requiredDate(resource.updated_at, 'tour.updated_at');
  const startDate = optionalDate(resource.start_date, 'tour.start_date');
  const endDate = optionalDate(resource.end_date, 'tour.end_date');
  const existing = realm.objectForPrimaryKey(Tour, uuid);

  if (
    existing &&
    (existing.artistUuid !== artistUuid ||
      existing.name !== resource.name ||
      existing.slug !== resource.slug ||
      existing.upstreamIdentifier !== resource.upstream_identifier ||
      existing.showCount !== resource.show_count ||
      existing.createdAt.getTime() !== createdAt.getTime() ||
      existing.updatedAt.getTime() !== updatedAt.getTime() ||
      existing.startDate?.getTime() !== startDate?.getTime() ||
      existing.endDate?.getTime() !== endDate?.getTime())
  ) {
    invalidateQueryValidator(realm, `GET /tours/${resource.id}`);
  }

  return realm.create(
    Tour,
    {
      uuid,
      artistUuid,
      createdAt,
      updatedAt,
      deletedAt: null,
      startDate,
      endDate,
      name: resource.name,
      slug: resource.slug,
      upstreamIdentifier: resource.upstream_identifier,
      showCount: resource.show_count,
    } as unknown as Realm.Unmanaged<Tour>,
    Realm.UpdateMode.Modified
  );
}

function applyImportedVenue(realm: Realm, resource: V4ImportedVenueResource) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'imported_venue');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const name = resource.name ?? '';
  return realm.create(
    Venue,
    {
      uuid,
      artistUuid,
      createdAt: requiredDate(resource.created_at, 'imported_venue.created_at'),
      updatedAt: requiredDate(resource.updated_at, 'imported_venue.updated_at'),
      deletedAt: null,
      latitude: resource.latitude,
      longitude: resource.longitude,
      name,
      location: resource.location ?? '',
      upstreamIdentifier: resource.upstream_identifier ?? '',
      slug: resource.slug ?? '',
      pastNames: resource.past_names,
      sortName: name,
      showsAtVenue: resource.show_count,
    } as unknown as Realm.Unmanaged<Venue>,
    Realm.UpdateMode.Modified
  );
}

function applyImportedSong(realm: Realm, resource: V4ImportedSongResource) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'imported_song');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  return realm.create(
    Song,
    {
      uuid,
      artistUuid,
      createdAt: requiredDate(resource.created_at, 'imported_song.created_at'),
      updatedAt: requiredDate(resource.updated_at, 'imported_song.updated_at'),
      deletedAt: null,
      name: resource.name,
      slug: resource.slug,
      upstreamIdentifier: resource.upstream_identifier,
      sortName: resource.name,
      showsPlayedAt: resource.setlist_show_count,
    } as unknown as Realm.Unmanaged<Song>,
    Realm.UpdateMode.Modified
  );
}

function applyNormalizedVenue(realm: Realm, resource: V4VenueResource) {
  const id = retainV4ShortCatalogId(resource.id, 'venue');
  const parentId = resource.parent_id
    ? retainV4ShortCatalogId(resource.parent_id, 'venue')
    : undefined;
  const metadataChanged = normalizedVenueMetadataChanged(
    realm.objectForPrimaryKey(NormalizedVenue, id),
    resource,
    parentId
  );
  const venue = realm.create(
    NormalizedVenue,
    {
      id,
      globalShowCount: resource.global_show_count,
      name: resource.name,
      kind: resource.kind,
      parentId: parentId ?? null,
      city: resource.city,
      region: resource.region,
      country: resource.country,
      latitude: resource.latitude,
      longitude: resource.longitude,
      coordinatePrecision: resource.coordinate_precision,
      names: resource.names,
    } as unknown as Realm.Unmanaged<NormalizedVenue>,
    Realm.UpdateMode.Modified
  );

  if (metadataChanged) {
    // Keep cached detail membership renderable while making the next read repair
    // metadata that an older overlapping browse or summary may have overwritten.
    invalidateQueryValidator(realm, `GET /venues/${resource.id}`);
    const artistVenues = realm.objects(ArtistVenue).filtered('venueId == $0', id);
    for (const artistVenue of artistVenues) {
      invalidateArtistVenueValidator(realm, artistVenue.artistUuid, id);
    }
  }

  return venue;
}

function applyArtistVenue(realm: Realm, resource: V4ArtistVenueResource) {
  const id = retainV4ShortCatalogId(resource.id, 'artist_venue');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const createdAt = requiredDate(resource.created_at, 'artist_venue.created_at');
  const updatedAt = requiredDate(resource.updated_at, 'artist_venue.updated_at');
  const existing = realm.objectForPrimaryKey(ArtistVenue, id);
  const venue = applyNormalizedVenue(realm, resource.venue);
  const artist = requireObject(realm, Artist, artistUuid, 'artist');
  const relationshipChanged =
    !existing ||
    existing.artistUuid !== artistUuid ||
    existing.artist?.uuid !== artistUuid ||
    existing.venueId !== venue.id ||
    existing.artistShowCount !== resource.artist_show_count ||
    existing.createdAt.getTime() !== createdAt.getTime() ||
    existing.updatedAt.getTime() !== updatedAt.getTime();
  const artistVenue = realm.create(
    ArtistVenue,
    {
      id,
      artistUuid,
      venueId: venue.id,
      artistShowCount: resource.artist_show_count,
      createdAt,
      updatedAt,
      artist,
      venue,
    },
    Realm.UpdateMode.Modified
  );
  if (relationshipChanged) {
    invalidateArtistVenueValidator(realm, artistUuid, venue.id);
  }
  return artistVenue;
}

function applyNormalizedSongReference(realm: Realm, resource: V4SongResource) {
  const id = retainV4ShortCatalogId(resource.id, 'song');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const artist = requireObject(realm, Artist, artistUuid, 'artist');
  const metadataChanged = normalizedSongReferenceChanged(
    realm.objectForPrimaryKey(NormalizedSong, id),
    resource,
    artistUuid
  );
  const song = realm.create(
    NormalizedSong,
    {
      id,
      artistUuid,
      name: resource.name,
      kind: resource.kind,
      artist,
    } as unknown as Realm.Unmanaged<NormalizedSong>,
    Realm.UpdateMode.Modified
  );

  if (metadataChanged) {
    // Compact normalization references own only these shared scalar fields;
    // rich song detail is deliberately neither compared nor cleared here.
    invalidateSongValidators(realm, resource.id);
  }

  return song;
}

function applyNormalizedSongDetail(realm: Realm, resource: V4SongDetailResource) {
  const id = retainV4ShortCatalogId(resource.id, 'song');
  const detailChanged = normalizedSongDetailChanged(
    realm.objectForPrimaryKey(NormalizedSong, id),
    resource
  );
  const song = applyNormalizedSongReference(realm, resource);
  const detailedSong = realm.create(
    NormalizedSong,
    {
      id: song.id,
      slug: resource.slug,
      originalArtist: resource.original_artist,
      aliases: resource.aliases,
      matchedTrackCount: resource.matched_track_count,
      matchedShowCount: resource.matched_show_count,
    } as unknown as Realm.Unmanaged<NormalizedSong>,
    Realm.UpdateMode.Modified
  );
  if (detailChanged) {
    invalidateSongValidators(realm, resource.id);
  }
  return detailedSong;
}

/** Additive canonical venue metadata patch for compact resolver responses. */
export function applyV4NormalizedVenue(realm: Realm, resource: V4VenueResource) {
  return applyNormalizedVenue(realm, resource);
}

/** Additive canonical song metadata patch for compact resolver responses. */
export function applyV4NormalizedSong(realm: Realm, resource: V4SongDetailResource) {
  return applyNormalizedSongDetail(realm, resource);
}

function applyShowSummary(realm: Realm, resource: V4ShowSummaryResource) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'show');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const yearUuid = resource.year_id ? decodeV4UuidCatalogId(resource.year_id, 'year') : undefined;
  const tourUuid = resource.tour_id ? decodeV4UuidCatalogId(resource.tour_id, 'tour') : undefined;

  if (resource.year) {
    const embeddedYear = applyYear(realm, resource.year);
    if (yearUuid !== embeddedYear.uuid) {
      throw new V4CatalogApplyError(`Show ${uuid} has inconsistent year identities.`);
    }
    requireMatchingArtist(embeddedYear.artistUuid, artistUuid, `Show ${uuid}'s year`);
  }
  if (resource.tour) {
    const embeddedTour = applyTour(realm, resource.tour);
    if (tourUuid !== embeddedTour.uuid) {
      throw new V4CatalogApplyError(`Show ${uuid} has inconsistent tour identities.`);
    }
    requireMatchingArtist(embeddedTour.artistUuid, artistUuid, `Show ${uuid}'s tour`);
  }

  const importedVenue = resource.imported_venue
    ? applyImportedVenue(realm, resource.imported_venue)
    : undefined;
  const artistVenue = resource.artist_venue
    ? applyArtistVenue(realm, resource.artist_venue)
    : undefined;
  const artist = requireObject(realm, Artist, artistUuid, 'artist');
  const tour = tourUuid ? requireObject(realm, Tour, tourUuid, 'tour') : undefined;
  const year = yearUuid ? requireObject(realm, Year, yearUuid, 'year') : undefined;
  if (year) {
    requireMatchingArtist(year.artistUuid, artistUuid, `Show ${uuid}'s year`);
  }
  if (tour) {
    requireMatchingArtist(tour.artistUuid, artistUuid, `Show ${uuid}'s tour`);
  }
  if (importedVenue) {
    requireMatchingArtist(importedVenue.artistUuid, artistUuid, `Show ${uuid}'s imported venue`);
  }
  if (artistVenue) {
    requireMatchingArtist(artistVenue.artistUuid, artistUuid, `Show ${uuid}'s artist venue`);
  }

  const show = realm.create(
    Show,
    {
      uuid,
      artistUuid,
      yearUuid: yearUuid ?? null,
      venueUuid: importedVenue?.uuid ?? null,
      tourUuid: tourUuid ?? null,
      createdAt: requiredDate(resource.created_at, 'show.created_at'),
      updatedAt: requiredDate(resource.updated_at, 'show.updated_at'),
      deletedAt: null,
      date: requiredDate(resource.date, 'show.date'),
      avgRating: resource.avg_rating,
      avgDuration: resource.avg_duration,
      displayDate: resource.display_date,
      mostRecentSourceUpdatedAt: requiredDate(
        resource.most_recent_source_updated_at,
        'show.most_recent_source_updated_at'
      ),
      hasSoundboardSource: resource.has_soundboard_source,
      hasStreamableFlacSource: resource.has_streamable_flac_source,
      sourceCount: resource.source_count,
      popularity: popularityProperties(resource.popularity),
      venue: importedVenue ?? null,
      tour: tour ?? null,
      artist,
      artistVenue: artistVenue ?? null,
    } as unknown as Realm.Unmanaged<Show>,
    Realm.UpdateMode.Modified
  );

  // Any summary writer can overwrite fields from a cached full show. Remove
  // only that detail validator so its next read repairs the shared row.
  deleteQueryState(realm, `GET /shows/${resource.id}`);

  return show;
}

function normalizationProperties(
  realm: Realm,
  resource: V4TrackNormalizationResource,
  artistUuid: string
) {
  return {
    state: resource.state,
    reason: resource.reason,
    parts: resource.parts.map((part) => ({
      ordinal: part.ordinal,
      text: part.text,
      state: part.state,
      qualifiers: part.qualifiers,
      notes: part.notes,
      segueAfter: part.segue_after,
      song: part.song ? applyTrackSongReference(realm, part.song, artistUuid) : null,
    })),
  };
}

function applyTrackSongReference(realm: Realm, resource: V4SongResource, artistUuid: string) {
  const song = applyNormalizedSongReference(realm, resource);
  requireMatchingArtist(song.artistUuid, artistUuid, `Track normalization song ${song.id}`);
  return song;
}

function trackScalarProperties(realm: Realm, resource: V4TrackResource) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'track');
  const sourceUuid = decodeV4UuidCatalogId(resource.source_id, 'source');
  const sourceSetUuid = decodeV4UuidCatalogId(resource.source_set_id, 'source_set');
  const showUuid = decodeV4UuidCatalogId(resource.show_id, 'show');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const artist = requireObject(realm, Artist, artistUuid, 'artist');
  if (!resource.mp3_url && !resource.flac_url) {
    throw new V4CatalogApplyError(`Track ${uuid} has no playable audio URL.`);
  }

  // Track scalars are shared by full show, source, track, and song-match
  // responses. Invalidate only those exact detail owners; the active endpoint's
  // coordinator recreates its own state after the transaction commits.
  deleteQueryState(realm, `GET /shows/${resource.show_id}`);
  deleteQueryState(realm, `GET /sources/${resource.source_id}`);
  deleteQueryState(realm, `GET /source-tracks/${resource.id}`);

  return {
    uuid,
    sourceUuid,
    sourceSetUuid,
    showUuid,
    artistUuid,
    createdAt: requiredDate(resource.created_at, 'track.created_at'),
    updatedAt: requiredDate(resource.updated_at, 'track.updated_at'),
    deletedAt: null,
    trackPosition: resource.track_position,
    duration: resource.duration,
    title: resource.title,
    slug: resource.slug,
    mp3Url: resource.mp3_url,
    mp3Md5: resource.mp3_md5,
    flacUrl: resource.flac_url,
    flacMd5: resource.flac_md5,
    artist,
    normalization: normalizationProperties(realm, resource.normalization, artistUuid),
  };
}

function applyTrackResource(realm: Realm, resource: V4TrackResource) {
  const properties = trackScalarProperties(realm, resource);
  const show = requireObject(realm, Show, properties.showUuid, 'show');
  const source = requireObject(realm, Source, properties.sourceUuid, 'source');
  const sourceSet = requireObject(realm, SourceSet, properties.sourceSetUuid, 'source set');

  if (
    show.artistUuid !== properties.artistUuid ||
    source.artistUuid !== properties.artistUuid ||
    source.showUuid !== properties.showUuid ||
    sourceSet.artistUuid !== properties.artistUuid ||
    sourceSet.sourceUuid !== properties.sourceUuid
  ) {
    throw new V4CatalogApplyError(`Track ${properties.uuid} has inconsistent recording parents.`);
  }
  const year = show.yearUuid ? requireObject(realm, Year, show.yearUuid, 'year') : undefined;
  if (year) {
    requireMatchingArtist(
      year.artistUuid,
      properties.artistUuid,
      `Track ${properties.uuid}'s year`
    );
  }

  const track = realm.create(
    SourceTrack,
    {
      ...properties,
      year: year ?? null,
      show,
      source,
    } as unknown as Realm.Unmanaged<SourceTrack>,
    Realm.UpdateMode.Modified
  );
  reconcileTrackMembership(realm, track, sourceSet);
  return track;
}

function applySongTrackResource(realm: Realm, resource: V4TrackResource, song: NormalizedSong) {
  const properties = trackScalarProperties(realm, resource);
  requireMatchingArtist(properties.artistUuid, song.artistUuid, `Track ${properties.uuid}`);
  if (
    !resource.normalization.parts.some(
      (part) => part.state === 'matched' && part.song?.id === song.id
    )
  ) {
    throw new V4CatalogApplyError(
      `Track ${properties.uuid} does not contain a matched part for song ${song.id}.`
    );
  }

  const show = requireObject(realm, Show, properties.showUuid, 'show');
  requireMatchingArtist(show.artistUuid, song.artistUuid, `Track ${properties.uuid}'s show`);
  const year = show.yearUuid ? requireObject(realm, Year, show.yearUuid, 'year') : undefined;
  const source = realm.objectForPrimaryKey(Source, properties.sourceUuid);
  if (
    source &&
    (source.artistUuid !== song.artistUuid || source.showUuid !== properties.showUuid)
  ) {
    throw new V4CatalogApplyError(`Track ${properties.uuid} has an inconsistent source parent.`);
  }

  return realm.create(
    SourceTrack,
    {
      ...properties,
      year: year ?? null,
      show,
      ...(source ? { source } : {}),
    } as unknown as Realm.Unmanaged<SourceTrack>,
    Realm.UpdateMode.Modified
  );
}

function applySourceSetResource(
  realm: Realm,
  resource: Omit<V4SourceSetResource, 'tracks'> & { tracks?: V4TrackResource[] }
) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'source_set');
  const sourceUuid = decodeV4UuidCatalogId(resource.source_id, 'source');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const source = requireObject(realm, Source, sourceUuid, 'source');
  if (source.artistUuid !== artistUuid) {
    throw new V4CatalogApplyError(`Source set ${uuid} has an inconsistent artist parent.`);
  }

  const sourceSet = realm.create(
    SourceSet,
    {
      uuid,
      sourceUuid,
      artistUuid,
      createdAt: requiredDate(resource.created_at, 'source_set.created_at'),
      updatedAt: requiredDate(resource.updated_at, 'source_set.updated_at'),
      deletedAt: null,
      index: resource.index,
      isEncore: resource.is_encore,
      name: resource.name,
    } as unknown as Realm.Unmanaged<SourceSet>,
    Realm.UpdateMode.Modified
  );
  reconcileSourceSetMembership(realm, sourceSet, source);

  // A resolver set is a shallow parent, not a replacement of playable tracks.
  if (!resource.tracks) {
    return sourceSet;
  }

  const returnedTracks = resource.tracks.map((track) => {
    const trackSourceUuid = decodeV4UuidCatalogId(track.source_id, 'source');
    const trackSourceSetUuid = decodeV4UuidCatalogId(track.source_set_id, 'source_set');
    if (trackSourceUuid !== sourceUuid || trackSourceSetUuid !== uuid) {
      throw new V4CatalogApplyError(`Track ${track.id} has an inconsistent set parent.`);
    }
    return applyTrackResource(realm, track);
  });
  const returnedIds = new Set(returnedTracks.map((track) => track.uuid));
  for (const existing of sourceSet.sourceTracks) {
    if (
      !returnedIds.has(existing.uuid) &&
      existing.sourceSetUuid === uuid &&
      existing.deletedAt == null
    ) {
      existing.deletedAt = new Date();
    }
  }
  sourceSet.sourceTracks.splice(0, sourceSet.sourceTracks.length, ...returnedTracks);
  return sourceSet;
}

function applySourceResource(
  realm: Realm,
  resource: Omit<V4SourceResource, 'sets' | 'links'> &
    Partial<Pick<V4SourceResource, 'sets' | 'links'>>
) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'source');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const showUuid = decodeV4UuidCatalogId(resource.show_id, 'show');
  const artist = requireObject(realm, Artist, artistUuid, 'artist');
  const show = requireObject(realm, Show, showUuid, 'show');
  if (show.artistUuid !== artistUuid) {
    throw new V4CatalogApplyError(`Source ${uuid} has an inconsistent show parent.`);
  }
  const importedVenue = resource.imported_venue
    ? applyImportedVenue(realm, resource.imported_venue)
    : undefined;
  if (importedVenue) {
    requireMatchingArtist(importedVenue.artistUuid, artistUuid, `Source ${uuid}'s imported venue`);
  }
  for (const link of resource.links ?? []) {
    if (decodeV4UuidCatalogId(link.source_id, 'source') !== uuid) {
      throw new V4CatalogApplyError(`Source ${uuid} has an inconsistent link parent.`);
    }
  }

  const returnedSetIds = (resource.sets ?? []).map((set) =>
    decodeV4UuidCatalogId(set.id, 'source_set')
  );
  requireUniqueIds(returnedSetIds, `Source ${uuid}'s set membership`);
  const returnedTrackIds = (resource.sets ?? []).flatMap((set) =>
    set.tracks.map((track) => decodeV4UuidCatalogId(track.id, 'track'))
  );
  requireUniqueIds(returnedTrackIds, `Source ${uuid}'s track membership`);

  const source = realm.create(
    Source,
    {
      uuid,
      artistUuid,
      showUuid,
      venueUuid: importedVenue?.uuid ?? null,
      createdAt: requiredDate(resource.created_at, 'source.created_at'),
      updatedAt: requiredDate(resource.updated_at, 'source.updated_at'),
      deletedAt: null,
      displayDate: resource.display_date,
      isSoundboard: resource.is_soundboard,
      isRemaster: resource.is_remaster,
      hasJamcharts: resource.has_jamcharts,
      avgRating: resource.avg_rating,
      numReviews: resource.num_reviews,
      numRatings: resource.num_ratings,
      avgRatingWeighted: resource.avg_rating_weighted,
      duration: resource.duration,
      upstreamIdentifier: resource.upstream_identifier,
      description: resource.description,
      taperNotes: resource.taper_notes,
      source: resource.source,
      taper: resource.taper,
      transferrer: resource.transferrer,
      lineage: resource.lineage,
      flacType: resource.flac_type,
      reviewCount: resource.review_count,
      linksRaw: resource.links
        ? JSON.stringify(resource.links)
        : (realm.objectForPrimaryKey(Source, uuid)?.linksRaw ?? '[]'),
      artist,
    } as unknown as Realm.Unmanaged<Source>,
    Realm.UpdateMode.Modified
  );

  if (!resource.sets) {
    return source;
  }

  const returnedSets = resource.sets.map((set) => {
    const setSourceUuid = decodeV4UuidCatalogId(set.source_id, 'source');
    if (setSourceUuid !== uuid) {
      throw new V4CatalogApplyError(`Source set ${set.id} has an inconsistent source parent.`);
    }
    return applySourceSetResource(realm, set);
  });
  const returnedIds = new Set(returnedSets.map((set) => set.uuid));
  for (const existing of source.sourceSets) {
    if (
      !returnedIds.has(existing.uuid) &&
      existing.sourceUuid === uuid &&
      existing.deletedAt == null
    ) {
      existing.deletedAt = new Date();
    }
  }
  source.sourceSets.splice(0, source.sourceSets.length, ...returnedSets);
  return source;
}

/** Applies the exact artists query result without deleting catalog entity rows. */
export function applyV4ArtistList(realm: Realm, resources: V4ArtistResource[]) {
  const artists = resources.map((resource) => applyArtist(realm, resource));
  return reconcileExactMembership(
    realm.objects(Artist),
    artists,
    'Artist query result',
    new Date()
  );
}

/** Applies one artist's complete year list without changing other artist collections. */
export function applyV4ArtistYears(realm: Realm, artistUuid: string, resources: V4YearResource[]) {
  requireObject(realm, Artist, artistUuid, 'artist');
  const years = resources.map((yearResource) => {
    const year = applyYear(realm, yearResource);
    requireMatchingArtist(year.artistUuid, artistUuid, `Year ${year.uuid}`);
    return year;
  });
  return reconcileExactMembership(
    realm.objects(Year).filtered('artistUuid == $0', artistUuid),
    years,
    `Artist ${artistUuid}'s year membership`,
    new Date()
  );
}

export function applyV4ArtistTours(realm: Realm, artistUuid: string, resources: V4TourResource[]) {
  const tours = resources.map((resource) => {
    const tour = applyTour(realm, resource);
    requireMatchingArtist(tour.artistUuid, artistUuid, `Tour ${tour.uuid}`);
    return tour;
  });

  reconcileExactMembership(
    realm.objects(Tour).filtered('artistUuid == $0', artistUuid),
    tours,
    `Artist ${artistUuid}'s tours`,
    new Date()
  );

  return resources.map((tour) => tour.id);
}

export function applyV4Tour(realm: Realm, artistUuid: string, resource: V4TourWithShowsResource) {
  const tour = applyTour(realm, resource);
  requireMatchingArtist(tour.artistUuid, artistUuid, `Tour ${tour.uuid}`);
  applyShowCollection(realm, resource.shows, `Tour ${tour.uuid}'s shows`, (show) => {
    requireMatchingArtist(show.artistUuid, artistUuid, `Show ${show.uuid}`);
    if (show.tourUuid !== tour.uuid) {
      throw new V4CatalogApplyError('Inconsistent tour membership.');
    }
  });

  return detailResultIds(resource.id, resource.shows);
}

/** Resolver patches update shared records; omitted child lists retain their membership. */
export function applyV4ResolvedEntities(
  realm: Realm,
  entities: V4CatalogResolveResponse['entities']
) {
  for (const resource of entities.artists) {
    applyArtist(realm, resource);
  }
  for (const resource of entities.years) {
    applyYear(realm, resource);
  }
  for (const resource of entities.tours) {
    applyTour(realm, resource);
  }
  for (const resource of entities.imported_venues) {
    applyImportedVenue(realm, resource);
  }
  for (const resource of entities.imported_songs) {
    applyImportedSong(realm, resource);
  }
  for (const resource of entities.venues) {
    applyNormalizedVenue(realm, resource);
  }
  for (const resource of entities.songs) {
    applyNormalizedSongDetail(realm, resource);
  }
  for (const resource of entities.artist_venues) {
    applyArtistVenue(realm, resource);
  }
  for (const resource of entities.shows) {
    applyShowSummary(realm, resource);
  }
  for (const resource of entities.sources) {
    applySourceResource(realm, resource);
    deleteQueryState(realm, `GET /sources/${resource.id}`);
    deleteQueryState(realm, `GET /shows/${resource.show_id}`);
  }
  for (const resource of entities.source_sets) {
    applySourceSetResource(realm, resource);
  }
  for (const resource of entities.tracks) {
    applyTrackResource(realm, resource);
  }
}

/** Applies one complete year's show summaries without changing other years. */
export function applyV4Year(
  realm: Realm,
  artistUuid: string,
  yearUuid: string,
  resource: V4YearWithShowsResource
) {
  requireObject(realm, Artist, artistUuid, 'artist');
  const year = applyYear(realm, resource);
  if (year.uuid !== yearUuid) {
    throw new V4CatalogApplyError(`Year ${year.uuid} does not match requested year ${yearUuid}.`);
  }
  requireMatchingArtist(year.artistUuid, artistUuid, `Year ${year.uuid}`);
  const shows = resource.shows.map((showResource) => {
    const show = applyShowSummary(realm, showResource);
    requireMatchingArtist(show.artistUuid, artistUuid, `Show ${show.uuid}`);
    if (show.yearUuid !== yearUuid) {
      throw new V4CatalogApplyError(`Show ${show.uuid} has an inconsistent year parent.`);
    }
    return show;
  });
  return reconcileExactMembership(
    realm.objects(Show).filtered('artistUuid == $0 AND yearUuid == $1', artistUuid, yearUuid),
    shows,
    `Year ${yearUuid}'s show membership`,
    new Date()
  );
}

/** Applies a full show and owns only this show's active source membership. */
export function applyV4FullShow(realm: Realm, resource: V4ShowResource) {
  const show = applyShowSummary(realm, resource);
  requireUniqueIds(
    resource.sources.map((source) => decodeV4UuidCatalogId(source.id, 'source')),
    `Show ${show.uuid}'s source membership`
  );
  requireUniqueIds(
    resource.sources.flatMap((source) =>
      source.sets.map((set) => decodeV4UuidCatalogId(set.id, 'source_set'))
    ),
    `Show ${show.uuid}'s set membership`
  );
  requireUniqueIds(
    resource.sources.flatMap((source) =>
      source.sets.flatMap((set) =>
        set.tracks.map((track) => decodeV4UuidCatalogId(track.id, 'track'))
      )
    ),
    `Show ${show.uuid}'s track membership`
  );
  const returnedSources = resource.sources.map((sourceResource) => {
    const sourceShowUuid = decodeV4UuidCatalogId(sourceResource.show_id, 'show');
    if (sourceShowUuid !== show.uuid) {
      throw new V4CatalogApplyError(`Source ${sourceResource.id} has an inconsistent show parent.`);
    }
    return applySourceResource(realm, sourceResource);
  });
  const returnedIds = new Set(returnedSources.map((source) => source.uuid));
  const existingSources = realm.objects(Source).filtered('showUuid == $0', show.uuid);
  for (const existing of existingSources) {
    if (!returnedIds.has(existing.uuid) && existing.deletedAt == null) {
      existing.deletedAt = new Date();
    }
  }
  return [show.uuid];
}

/** Applies a full source and owns only this source's set/track membership. */
export function applyV4FullSource(realm: Realm, resource: V4SourceResource) {
  return [applySourceResource(realm, resource).uuid];
}

/** Applies one complete track and repairs its single parent-set membership. */
export function applyV4Track(realm: Realm, resource: V4TrackResource) {
  return [applyTrackResource(realm, resource).uuid];
}

function applyShowCollection(
  realm: Realm,
  resources: V4ShowSummaryResource[],
  description: string,
  validate: (show: Show) => void
) {
  requireUniqueIds(
    resources.map((resource) => resource.id),
    description
  );
  return resources.map((resource) => {
    const show = applyShowSummary(realm, resource);
    validate(show);
    return show;
  });
}

/** A feed patches returned rows without deleting any shared catalog membership. */
export function applyV4ShowSummaries(realm: Realm, resources: V4ShowSummaryResource[]) {
  return applyShowCollection(realm, resources, 'Show feed', () => {});
}

function detailResultIds(rootId: string, resources: Array<{ id: string }>) {
  return [rootId, ...resources.map((resource) => resource.id)];
}

/** Applies one artist's ordered mixed canonical/imported venue browse result. */
export function applyV4ArtistVenues(
  realm: Realm,
  artistUuid: string,
  resources: V4ArtistVenueEntryResource[]
) {
  requireObject(realm, Artist, artistUuid, 'artist');
  const resultIds = resources.map((entry) => {
    const value = entry as unknown as {
      kind: string;
      artist_venue: V4ArtistVenueResource | null;
      imported_venue: V4ImportedVenueResource | null;
    };
    if (value.kind === 'artist_venue') {
      if (!value.artist_venue || value.imported_venue !== null) {
        throw new V4CatalogApplyError('Artist venue entry has inconsistent kind and target.');
      }
      const artistVenue = applyArtistVenue(realm, value.artist_venue);
      requireMatchingArtist(artistVenue.artistUuid, artistUuid, `Artist venue ${artistVenue.id}`);
      return value.artist_venue.id;
    }
    if (value.kind === 'imported_venue') {
      if (!value.imported_venue || value.artist_venue !== null) {
        throw new V4CatalogApplyError('Imported venue entry has inconsistent kind and target.');
      }
      const importedVenue = applyImportedVenue(realm, value.imported_venue);
      requireMatchingArtist(importedVenue.artistUuid, artistUuid, `Venue ${importedVenue.uuid}`);
      return value.imported_venue.id;
    }
    throw new V4CatalogApplyError(`Unknown artist venue entry kind: ${value.kind}.`);
  });
  requireUniqueIds(resultIds, `Artist ${artistUuid}'s venue browse membership`);
  return resultIds;
}

/** Applies one artist's ordered mixed canonical/imported song browse result. */
export function applyV4ArtistSongs(
  realm: Realm,
  artistUuid: string,
  resources: V4ArtistSongEntryResource[]
) {
  requireObject(realm, Artist, artistUuid, 'artist');
  const resultIds = resources.map((entry) => {
    const value = entry as unknown as {
      kind: string;
      song: V4SongDetailResource | null;
      imported_song: V4ImportedSongResource | null;
    };
    if (value.kind === 'song') {
      if (!value.song || value.imported_song !== null) {
        throw new V4CatalogApplyError('Song entry has inconsistent kind and target.');
      }
      const song = applyNormalizedSongDetail(realm, value.song);
      requireMatchingArtist(song.artistUuid, artistUuid, `Song ${song.id}`);
      return value.song.id;
    }
    if (value.kind === 'imported_song') {
      if (!value.imported_song || value.song !== null) {
        throw new V4CatalogApplyError('Imported song entry has inconsistent kind and target.');
      }
      const song = applyImportedSong(realm, value.imported_song);
      requireMatchingArtist(song.artistUuid, artistUuid, `Imported song ${song.uuid}`);
      return value.imported_song.id;
    }
    throw new V4CatalogApplyError(`Unknown artist song entry kind: ${value.kind}.`);
  });
  requireUniqueIds(resultIds, `Artist ${artistUuid}'s song browse membership`);
  return resultIds;
}

export function applyV4ArtistVenue(
  realm: Realm,
  artistUuid: string,
  resource: V4ArtistVenueWithShowsResource
) {
  const artistVenue = applyArtistVenue(realm, resource);
  requireMatchingArtist(artistVenue.artistUuid, artistUuid, `Artist venue ${artistVenue.id}`);
  applyShowCollection(
    realm,
    resource.shows,
    `Artist venue ${artistVenue.id}'s show membership`,
    (show) => {
      requireMatchingArtist(show.artistUuid, artistUuid, `Show ${show.uuid}`);
      if (show.artistVenue?.id !== artistVenue.id) {
        throw new V4CatalogApplyError(`Show ${show.uuid} has an inconsistent artist venue parent.`);
      }
    }
  );
  return detailResultIds(resource.id, resource.shows);
}

export function applyV4ImportedVenue(
  realm: Realm,
  artistUuid: string,
  resource: V4ImportedVenueWithShowsResource
) {
  const venue = applyImportedVenue(realm, resource);
  requireMatchingArtist(venue.artistUuid, artistUuid, `Imported venue ${venue.uuid}`);
  applyShowCollection(
    realm,
    resource.shows,
    `Imported venue ${venue.uuid}'s show membership`,
    (show) => {
      requireMatchingArtist(show.artistUuid, artistUuid, `Show ${show.uuid}`);
      if (show.venueUuid !== venue.uuid) {
        throw new V4CatalogApplyError(
          `Show ${show.uuid} has an inconsistent imported venue parent.`
        );
      }
    }
  );
  return detailResultIds(resource.id, resource.shows);
}

export function applyV4Venue(realm: Realm, resource: V4VenueWithShowsResource) {
  const venue = applyNormalizedVenue(realm, resource);
  applyShowCollection(realm, resource.shows, `Venue ${venue.id}'s show membership`, (show) => {
    if (show.artistVenue?.venueId !== venue.id) {
      throw new V4CatalogApplyError(`Show ${show.uuid} has an inconsistent venue parent.`);
    }
  });
  return detailResultIds(resource.id, resource.shows);
}

export function applyV4Song(realm: Realm, artistUuid: string, resource: V4SongWithShowsResource) {
  const song = applyNormalizedSongDetail(realm, resource);
  requireMatchingArtist(song.artistUuid, artistUuid, `Song ${song.id}`);
  applyShowCollection(realm, resource.shows, `Song ${song.id}'s show membership`, (show) =>
    requireMatchingArtist(show.artistUuid, artistUuid, `Show ${show.uuid}`)
  );
  return detailResultIds(resource.id, resource.shows);
}

export function applyV4SongTracks(
  realm: Realm,
  artistUuid: string,
  resource: V4SongWithTracksResource
) {
  const song = applyNormalizedSongDetail(realm, resource);
  requireMatchingArtist(song.artistUuid, artistUuid, `Song ${song.id}`);
  requireUniqueIds(
    resource.tracks.map((track) => track.id),
    `Song ${song.id}'s track membership`
  );
  for (const track of resource.tracks) {
    applySongTrackResource(realm, track, song);
  }
  return detailResultIds(resource.id, resource.tracks);
}

export function applyV4ImportedSong(
  realm: Realm,
  artistUuid: string,
  resource: V4ImportedSongWithShowsResource
) {
  const song = applyImportedSong(realm, resource);
  requireMatchingArtist(song.artistUuid, artistUuid, `Imported song ${song.uuid}`);
  const shows = applyShowCollection(
    realm,
    resource.shows,
    `Imported song ${song.uuid}'s show membership`,
    (show) => requireMatchingArtist(show.artistUuid, artistUuid, `Show ${show.uuid}`)
  );
  for (const existing of Array.from(song.shows)) {
    song.shows.delete(existing);
  }
  for (const show of shows) {
    song.shows.add(show);
  }
  return detailResultIds(resource.id, resource.shows);
}

function isActive(row: { deletedAt?: Date } | null | undefined): row is { deletedAt?: Date } {
  return row != null && row.deletedAt == null;
}

function hasExactResultRows<T extends { uuid: string }>(
  rows: Iterable<T>,
  resultIds: Iterable<string>,
  isValid: (row: T) => boolean
) {
  const activeRows = Array.from(rows);
  const listedIds = Array.from(resultIds);
  const listedIdSet = new Set(listedIds);
  return (
    listedIdSet.size === listedIds.length &&
    activeRows.length === listedIds.length &&
    activeRows.every((row) => listedIdSet.has(row.uuid) && isValid(row))
  );
}

export function hasV4ArtistYears(realm: Realm, artistUuid: string, resultIds: Iterable<string>) {
  const artist = realm.objectForPrimaryKey(Artist, artistUuid);
  if (!isActive(artist)) {
    return false;
  }

  return hasExactResultRows(
    realm.objects(Year).filtered('artistUuid == $0 AND deletedAt == nil', artistUuid),
    resultIds,
    (year) => year.artistUuid === artistUuid
  );
}

function hasActiveShowRowAndParents(realm: Realm, show: Show | null): show is Show {
  if (!isActive(show)) {
    return false;
  }

  const artist = realm.objectForPrimaryKey(Artist, show.artistUuid);
  if (!isActive(artist) || show.artist?.uuid !== artist.uuid) {
    return false;
  }

  if (show.yearUuid) {
    const year = realm.objectForPrimaryKey(Year, show.yearUuid);
    if (!isActive(year) || year.artistUuid !== show.artistUuid) {
      return false;
    }
  }
  if (show.tourUuid) {
    const tour = realm.objectForPrimaryKey(Tour, show.tourUuid);
    if (!isActive(tour) || tour.artistUuid !== show.artistUuid || show.tour?.uuid !== tour.uuid) {
      return false;
    }
  }
  if (show.venueUuid) {
    const venue = realm.objectForPrimaryKey(Venue, show.venueUuid);
    if (
      !isActive(venue) ||
      venue.artistUuid !== show.artistUuid ||
      show.venue?.uuid !== venue.uuid
    ) {
      return false;
    }
  }

  return true;
}

export function hasV4Year(
  realm: Realm,
  artistUuid: string,
  yearUuid: string,
  resultIds: Iterable<string>
) {
  const artist = realm.objectForPrimaryKey(Artist, artistUuid);
  const year = realm.objectForPrimaryKey(Year, yearUuid);
  if (!isActive(artist) || !isActive(year) || year.artistUuid !== artistUuid) {
    return false;
  }

  const listedIds = Array.from(resultIds);
  if (year.showCount !== listedIds.length) {
    return false;
  }

  return hasExactResultRows(
    realm
      .objects(Show)
      .filtered('artistUuid == $0 AND yearUuid == $1 AND deletedAt == nil', artistUuid, yearUuid),
    listedIds,
    (show) =>
      show.artistUuid === artistUuid &&
      show.yearUuid === yearUuid &&
      hasActiveShowRowAndParents(realm, show)
  );
}

function hasActiveTrackGraph(
  realm: Realm,
  track: SourceTrack | null,
  expectedSource?: Source,
  expectedSet?: SourceSet
): track is SourceTrack {
  if (!isActive(track) || (!track.mp3Url && !track.flacUrl)) {
    return false;
  }

  const show = realm.objectForPrimaryKey(Show, track.showUuid);
  const source = expectedSource ?? realm.objectForPrimaryKey(Source, track.sourceUuid);
  const sourceSet = expectedSet ?? realm.objectForPrimaryKey(SourceSet, track.sourceSetUuid);
  const artist = realm.objectForPrimaryKey(Artist, track.artistUuid);
  if (
    !hasActiveShowRowAndParents(realm, show) ||
    !isActive(source) ||
    !isActive(sourceSet) ||
    !isActive(artist)
  ) {
    return false;
  }

  return (
    show.artistUuid === track.artistUuid &&
    source.artistUuid === track.artistUuid &&
    source.showUuid === track.showUuid &&
    sourceSet.artistUuid === track.artistUuid &&
    sourceSet.sourceUuid === track.sourceUuid &&
    track.artist?.uuid === artist.uuid &&
    track.show?.uuid === show.uuid &&
    track.source?.uuid === source.uuid &&
    source.sourceSets.some((candidate) => candidate.uuid === sourceSet.uuid) &&
    sourceSet.sourceTracks.some((candidate) => candidate.uuid === track.uuid)
  );
}

function hasActiveSourceGraph(realm: Realm, source: Source | null): source is Source {
  if (!isActive(source)) {
    return false;
  }

  const artist = realm.objectForPrimaryKey(Artist, source.artistUuid);
  const show = realm.objectForPrimaryKey(Show, source.showUuid);
  if (
    !isActive(artist) ||
    !hasActiveShowRowAndParents(realm, show) ||
    source.artist?.uuid !== artist.uuid ||
    show.artistUuid !== source.artistUuid
  ) {
    return false;
  }

  const activeSets = realm
    .objects(SourceSet)
    .filtered('sourceUuid == $0 AND deletedAt == nil', source.uuid);
  if (
    source.sourceSets.length !== activeSets.length ||
    source.sourceSets.some(
      (sourceSet) =>
        !isActive(sourceSet) ||
        sourceSet.sourceUuid !== source.uuid ||
        sourceSet.artistUuid !== source.artistUuid
    )
  ) {
    return false;
  }

  const listedSetIds = new Set(source.sourceSets.map((sourceSet) => sourceSet.uuid));
  if (activeSets.some((sourceSet) => !listedSetIds.has(sourceSet.uuid))) {
    return false;
  }

  for (const sourceSet of source.sourceSets) {
    const activeTracks = realm
      .objects(SourceTrack)
      .filtered('sourceSetUuid == $0 AND deletedAt == nil', sourceSet.uuid);
    if (
      sourceSet.sourceTracks.length !== activeTracks.length ||
      sourceSet.sourceTracks.some((track) => !hasActiveTrackGraph(realm, track, source, sourceSet))
    ) {
      return false;
    }

    const listedTrackIds = new Set(sourceSet.sourceTracks.map((track) => track.uuid));
    if (activeTracks.some((track) => !listedTrackIds.has(track.uuid))) {
      return false;
    }
  }

  return true;
}

export function hasV4Show(realm: Realm, showUuid: string) {
  const show = realm.objectForPrimaryKey(Show, showUuid);
  if (!hasActiveShowRowAndParents(realm, show)) {
    return false;
  }

  const activeSources = realm
    .objects(Source)
    .filtered('showUuid == $0 AND deletedAt == nil', showUuid);
  return (
    activeSources.length === show.sourceCount &&
    activeSources.every((source) => hasActiveSourceGraph(realm, source)) &&
    activeSources.some((source) =>
      source.sourceSets.some((sourceSet) => sourceSet.sourceTracks.length > 0)
    )
  );
}

export function hasV4Source(realm: Realm, sourceUuid: string) {
  return hasActiveSourceGraph(realm, realm.objectForPrimaryKey(Source, sourceUuid));
}

export function hasV4Track(realm: Realm, trackUuid: string) {
  return hasActiveTrackGraph(realm, realm.objectForPrimaryKey(SourceTrack, trackUuid));
}

function tryDecodeUuidId<TPrefix extends V4UuidCatalogPrefix>(value: string, prefix: TPrefix) {
  try {
    return decodeV4UuidCatalogId(value, prefix);
  } catch {
    return undefined;
  }
}

function tryRetainShortId<TPrefix extends V4ShortCatalogPrefix>(value: string, prefix: TPrefix) {
  try {
    return retainV4ShortCatalogId(value, prefix);
  } catch {
    return undefined;
  }
}

function hasUniqueResultIds(resultIds: string[]) {
  return new Set(resultIds).size === resultIds.length;
}

function hasShowResults(realm: Realm, resultIds: string[], validate: (show: Show) => boolean) {
  if (!hasUniqueResultIds(resultIds)) {
    return false;
  }
  return resultIds.every((resultId) => {
    const showUuid = tryDecodeUuidId(resultId, 'show');
    if (!showUuid) {
      return false;
    }
    const show = realm.objectForPrimaryKey(Show, showUuid);
    return hasActiveShowRowAndParents(realm, show) && validate(show);
  });
}

function hasArtistVenue(realm: Realm, id: string, artistUuid: string) {
  const artistVenue = realm.objectForPrimaryKey(ArtistVenue, id);
  return (
    artistVenue !== null &&
    artistVenue.artistUuid === artistUuid &&
    artistVenue.artist?.uuid === artistUuid &&
    artistVenue.venueId === artistVenue.venue.id
  );
}

function hasNormalizedSong(realm: Realm, id: string, artistUuid: string) {
  const song = realm.objectForPrimaryKey(NormalizedSong, id);
  return song !== null && song.artistUuid === artistUuid && song.artist?.uuid === artistUuid;
}

export function hasV4ArtistVenues(realm: Realm, artistUuid: string, resultIds: Iterable<string>) {
  const artist = realm.objectForPrimaryKey(Artist, artistUuid);
  if (!isActive(artist)) {
    return false;
  }
  const ids = Array.from(resultIds);
  if (!hasUniqueResultIds(ids)) {
    return false;
  }

  return ids.every((id) => {
    const artistVenueId = tryRetainShortId(id, 'artist_venue');
    if (artistVenueId) {
      return hasArtistVenue(realm, artistVenueId, artistUuid);
    }

    const importedVenueUuid = tryDecodeUuidId(id, 'imported_venue');
    const venue = importedVenueUuid
      ? realm.objectForPrimaryKey(Venue, importedVenueUuid)
      : undefined;
    return isActive(venue) && venue.artistUuid === artistUuid;
  });
}

export function hasV4ArtistSongs(realm: Realm, artistUuid: string, resultIds: Iterable<string>) {
  const artist = realm.objectForPrimaryKey(Artist, artistUuid);
  if (!isActive(artist)) {
    return false;
  }
  const ids = Array.from(resultIds);
  if (!hasUniqueResultIds(ids)) {
    return false;
  }

  return ids.every((id) => {
    const normalizedSongId = tryRetainShortId(id, 'song');
    if (normalizedSongId) {
      return hasNormalizedSong(realm, normalizedSongId, artistUuid);
    }

    const importedSongUuid = tryDecodeUuidId(id, 'imported_song');
    const song = importedSongUuid ? realm.objectForPrimaryKey(Song, importedSongUuid) : undefined;
    return isActive(song) && song.artistUuid === artistUuid;
  });
}

export function hasV4ArtistVenue(realm: Realm, artistUuid: string, resultIds: Iterable<string>) {
  const [rootId, ...showIds] = Array.from(resultIds);
  const artistVenueId = rootId ? tryRetainShortId(rootId, 'artist_venue') : undefined;
  if (!artistVenueId || !hasArtistVenue(realm, artistVenueId, artistUuid)) {
    return false;
  }

  return hasShowResults(
    realm,
    showIds,
    (show) => show.artistUuid === artistUuid && show.artistVenue?.id === artistVenueId
  );
}

export function hasV4ImportedVenue(realm: Realm, artistUuid: string, resultIds: Iterable<string>) {
  const [rootId, ...showIds] = Array.from(resultIds);
  const venueUuid = rootId ? tryDecodeUuidId(rootId, 'imported_venue') : undefined;
  const venue = venueUuid ? realm.objectForPrimaryKey(Venue, venueUuid) : undefined;
  if (!isActive(venue) || venue.artistUuid !== artistUuid) {
    return false;
  }

  return hasShowResults(
    realm,
    showIds,
    (show) => show.artistUuid === artistUuid && show.venueUuid === venueUuid
  );
}

export function hasV4Venue(realm: Realm, resultIds: Iterable<string>) {
  const [rootId, ...showIds] = Array.from(resultIds);
  const venueId = rootId ? tryRetainShortId(rootId, 'venue') : undefined;
  if (!venueId || !realm.objectForPrimaryKey(NormalizedVenue, venueId)) {
    return false;
  }
  return hasShowResults(realm, showIds, (show) => show.artistVenue?.venueId === venueId);
}

export function hasV4Song(realm: Realm, artistUuid: string, resultIds: Iterable<string>) {
  const [rootId, ...showIds] = Array.from(resultIds);
  const songId = rootId ? tryRetainShortId(rootId, 'song') : undefined;
  const song = songId ? realm.objectForPrimaryKey(NormalizedSong, songId) : undefined;
  if (!song || !hasNormalizedSong(realm, song.id, artistUuid)) {
    return false;
  }
  return hasShowResults(realm, showIds, (show) => show.artistUuid === artistUuid);
}

export function hasV4SongTracks(realm: Realm, artistUuid: string, resultIds: Iterable<string>) {
  const [rootId, ...trackIds] = Array.from(resultIds);
  const songId = rootId ? tryRetainShortId(rootId, 'song') : undefined;
  const song = songId ? realm.objectForPrimaryKey(NormalizedSong, songId) : undefined;
  if (!song || !hasNormalizedSong(realm, song.id, artistUuid)) {
    return false;
  }
  if (!hasUniqueResultIds(trackIds)) {
    return false;
  }
  return trackIds.every((id) => {
    const uuid = tryDecodeUuidId(id, 'track');
    const track = uuid ? realm.objectForPrimaryKey(SourceTrack, uuid) : undefined;
    if (!isActive(track)) {
      return false;
    }
    const show = realm.objectForPrimaryKey(Show, track.showUuid);
    return (
      track.artistUuid === artistUuid &&
      !!(track.mp3Url || track.flacUrl) &&
      hasActiveShowRowAndParents(realm, show) &&
      track.normalization?.parts.some(
        (part) => part.state === 'matched' && part.song?.id === song.id
      ) === true
    );
  });
}

export function hasV4ImportedSong(realm: Realm, artistUuid: string, resultIds: Iterable<string>) {
  const [rootId, ...showIds] = Array.from(resultIds);
  const songUuid = rootId ? tryDecodeUuidId(rootId, 'imported_song') : undefined;
  const song = songUuid ? realm.objectForPrimaryKey(Song, songUuid) : undefined;
  if (!isActive(song) || song.artistUuid !== artistUuid) {
    return false;
  }
  const expectedShowUuids = showIds.map((id) => tryDecodeUuidId(id, 'show'));
  if (expectedShowUuids.some((uuid) => !uuid) || song.shows.size !== expectedShowUuids.length) {
    return false;
  }
  const expected = new Set(expectedShowUuids);
  return (
    Array.from(song.shows).every((show) => expected.has(show.uuid)) &&
    hasShowResults(realm, showIds, (show) => show.artistUuid === artistUuid)
  );
}
