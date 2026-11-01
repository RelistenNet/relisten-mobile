import Realm from 'realm';

import type {
  V4ArtistResource,
  V4ArtistVenueResource,
  V4ImportedVenueResource,
  V4PopularityResource,
  V4ShowResource,
  V4ShowSummaryResource,
  V4SongResource,
  V4SourceResource,
  V4SourceSetResource,
  V4TourResource,
  V4TrackNormalizationResource,
  V4TrackResource,
  V4VenueResource,
  V4YearResource,
  V4YearWithShowsResource,
} from '@/relisten/api/v4/wire_types';
import { decodeV4UuidCatalogId, retainV4ShortCatalogId } from '@/relisten/api/v4/catalog_identity';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Tour } from '@/relisten/realm/models/tour';
import { Venue } from '@/relisten/realm/models/venue';
import { ArtistVenue, NormalizedSong, NormalizedVenue } from '@/relisten/realm/models/v4_catalog';
import { Year } from '@/relisten/realm/models/year';

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
  if (!popularity) return null;

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
    if (!returnedIdSet.has(row.uuid) && row.deletedAt == null) row.deletedAt = tombstoneAt;
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
    if (sourceSet.uuid !== targetSet.uuid) removeTrackFromSet(sourceSet, track.uuid);
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
    if (source.uuid !== targetSource.uuid) removeSetFromSource(source, sourceSet.uuid);
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
      showCount: resource.show_count,
      sourceCount: resource.source_count,
    } as unknown as Realm.Unmanaged<Artist>,
    Realm.UpdateMode.Modified
  );
}

function applyYear(realm: Realm, resource: V4YearResource) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'year');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
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
    } as unknown as Realm.Unmanaged<Year>,
    Realm.UpdateMode.Modified
  );
}

function applyTour(realm: Realm, resource: V4TourResource) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'tour');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  return realm.create(
    Tour,
    {
      uuid,
      artistUuid,
      createdAt: requiredDate(resource.created_at, 'tour.created_at'),
      updatedAt: requiredDate(resource.updated_at, 'tour.updated_at'),
      deletedAt: null,
      startDate: optionalDate(resource.start_date, 'tour.start_date'),
      endDate: optionalDate(resource.end_date, 'tour.end_date'),
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

function applyNormalizedVenue(realm: Realm, resource: V4VenueResource) {
  const id = retainV4ShortCatalogId(resource.id, 'venue');
  const parentId = resource.parent_id
    ? retainV4ShortCatalogId(resource.parent_id, 'venue')
    : undefined;
  return realm.create(
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
}

function applyArtistVenue(realm: Realm, resource: V4ArtistVenueResource) {
  const id = retainV4ShortCatalogId(resource.id, 'artist_venue');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const venue = applyNormalizedVenue(realm, resource.venue);
  const artist = requireObject(realm, Artist, artistUuid, 'artist');
  return realm.create(
    ArtistVenue,
    {
      id,
      artistUuid,
      venueId: venue.id,
      artistShowCount: resource.artist_show_count,
      createdAt: requiredDate(resource.created_at, 'artist_venue.created_at'),
      updatedAt: requiredDate(resource.updated_at, 'artist_venue.updated_at'),
      artist,
      venue,
    },
    Realm.UpdateMode.Modified
  );
}

function applyNormalizedSongReference(realm: Realm, resource: V4SongResource) {
  const id = retainV4ShortCatalogId(resource.id, 'song');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const artist = requireObject(realm, Artist, artistUuid, 'artist');
  return realm.create(
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
  if (year) requireMatchingArtist(year.artistUuid, artistUuid, `Show ${uuid}'s year`);
  if (tour) requireMatchingArtist(tour.artistUuid, artistUuid, `Show ${uuid}'s tour`);
  if (importedVenue) {
    requireMatchingArtist(importedVenue.artistUuid, artistUuid, `Show ${uuid}'s imported venue`);
  }
  if (artistVenue) {
    requireMatchingArtist(artistVenue.artistUuid, artistUuid, `Show ${uuid}'s artist venue`);
  }

  return realm.create(
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

function applyTrackResource(realm: Realm, resource: V4TrackResource) {
  const uuid = decodeV4UuidCatalogId(resource.id, 'track');
  const sourceUuid = decodeV4UuidCatalogId(resource.source_id, 'source');
  const sourceSetUuid = decodeV4UuidCatalogId(resource.source_set_id, 'source_set');
  const showUuid = decodeV4UuidCatalogId(resource.show_id, 'show');
  const artistUuid = decodeV4UuidCatalogId(resource.artist_id, 'artist');
  const artist = requireObject(realm, Artist, artistUuid, 'artist');
  const show = requireObject(realm, Show, showUuid, 'show');
  const source = requireObject(realm, Source, sourceUuid, 'source');
  const sourceSet = requireObject(realm, SourceSet, sourceSetUuid, 'source set');

  if (
    show.artistUuid !== artistUuid ||
    source.artistUuid !== artistUuid ||
    source.showUuid !== showUuid ||
    sourceSet.artistUuid !== artistUuid ||
    sourceSet.sourceUuid !== sourceUuid
  ) {
    throw new V4CatalogApplyError(`Track ${uuid} has inconsistent recording parents.`);
  }
  const year = show.yearUuid ? requireObject(realm, Year, show.yearUuid, 'year') : undefined;
  if (year) requireMatchingArtist(year.artistUuid, artistUuid, `Track ${uuid}'s year`);
  if (!resource.mp3_url && !resource.flac_url) {
    throw new V4CatalogApplyError(`Track ${uuid} has no playable audio URL.`);
  }

  const track = realm.create(
    SourceTrack,
    {
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
      year: year ?? null,
      show,
      source,
      normalization: normalizationProperties(realm, resource.normalization, artistUuid),
    } as unknown as Realm.Unmanaged<SourceTrack>,
    Realm.UpdateMode.Modified
  );
  reconcileTrackMembership(realm, track, sourceSet);
  return track;
}

function applySourceSetResource(realm: Realm, resource: V4SourceSetResource) {
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

function applySourceResource(realm: Realm, resource: V4SourceResource) {
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
  for (const link of resource.links) {
    if (decodeV4UuidCatalogId(link.source_id, 'source') !== uuid) {
      throw new V4CatalogApplyError(`Source ${uuid} has an inconsistent link parent.`);
    }
  }

  const returnedSetIds = resource.sets.map((set) => decodeV4UuidCatalogId(set.id, 'source_set'));
  requireUniqueIds(returnedSetIds, `Source ${uuid}'s set membership`);
  const returnedTrackIds = resource.sets.flatMap((set) =>
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
      linksRaw: JSON.stringify(resource.links),
      artist,
    } as unknown as Realm.Unmanaged<Source>,
    Realm.UpdateMode.Modified
  );

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
  if (!isActive(artist)) return false;

  return hasExactResultRows(
    realm.objects(Year).filtered('artistUuid == $0 AND deletedAt == nil', artistUuid),
    resultIds,
    (year) => year.artistUuid === artistUuid
  );
}

function hasActiveShowRowAndParents(realm: Realm, show: Show | null): show is Show {
  if (!isActive(show)) return false;

  const artist = realm.objectForPrimaryKey(Artist, show.artistUuid);
  if (!isActive(artist) || show.artist?.uuid !== artist.uuid) return false;

  if (show.yearUuid) {
    const year = realm.objectForPrimaryKey(Year, show.yearUuid);
    if (!isActive(year) || year.artistUuid !== show.artistUuid) return false;
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
  if (!isActive(artist) || !isActive(year) || year.artistUuid !== artistUuid) return false;

  const listedIds = Array.from(resultIds);
  if (year.showCount !== listedIds.length) return false;

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
  if (!isActive(track) || (!track.mp3Url && !track.flacUrl)) return false;

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
  if (!isActive(source)) return false;

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
  if (activeSets.some((sourceSet) => !listedSetIds.has(sourceSet.uuid))) return false;

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
    if (activeTracks.some((track) => !listedTrackIds.has(track.uuid))) return false;
  }

  return true;
}

export function hasV4Show(realm: Realm, showUuid: string) {
  const show = realm.objectForPrimaryKey(Show, showUuid);
  if (!hasActiveShowRowAndParents(realm, show)) return false;

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
