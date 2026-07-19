import Realm from 'realm';
import type { CatalogResolveResponse } from '@/relisten/api/models/catalog_resolve';
import { Artist } from '@/relisten/realm/models/artist';
import { artistRepo } from '@/relisten/realm/models/artist_repo';
import { Show } from '@/relisten/realm/models/show';
import { showRepo } from '@/relisten/realm/models/show_repository';
import { Song } from '@/relisten/realm/models/song';
import { songRepo } from '@/relisten/realm/models/song_repo';
import { Source } from '@/relisten/realm/models/source';
import { sourceRepo } from '@/relisten/realm/models/source_repo';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { sourceSetRepo } from '@/relisten/realm/models/source_set_repo';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { sourceTrackRepo } from '@/relisten/realm/models/source_track_repo';
import { Tour } from '@/relisten/realm/models/tour';
import { tourRepo } from '@/relisten/realm/models/tour_repo';
import { Venue } from '@/relisten/realm/models/venue';
import { venueRepo } from '@/relisten/realm/models/venue_repo';
import { Year } from '@/relisten/realm/models/year';
import { yearRepo } from '@/relisten/realm/models/year_repo';

/** Upserts ordinary catalog DTOs, then restores the Realm links consumed by existing screens. */
export function applyResolvedCatalogEntities(realm: Realm, response: CatalogResolveResponse) {
  for (const artist of response.entities.artists) {
    artistRepo.upsert(realm, artist, realm.objectForPrimaryKey(Artist, artist.uuid) ?? undefined);
  }
  for (const year of response.entities.years) {
    yearRepo.upsert(realm, year, realm.objectForPrimaryKey(Year, year.uuid) ?? undefined);
  }
  for (const venue of response.entities.venues) {
    venueRepo.upsert(realm, venue, realm.objectForPrimaryKey(Venue, venue.uuid) ?? undefined);
  }
  for (const tour of response.entities.tours) {
    tourRepo.upsert(realm, tour, realm.objectForPrimaryKey(Tour, tour.uuid) ?? undefined);
  }
  for (const show of response.entities.shows) {
    showRepo.upsert(realm, show, realm.objectForPrimaryKey(Show, show.uuid) ?? undefined);
  }
  for (const source of response.entities.sources) {
    // Resolver sources intentionally omit link details. Preserve a richer row
    // already loaded by the normal show endpoint; a fresh shallow row is still
    // enough to render the favorite and navigate to that full endpoint.
    if (!realm.objectForPrimaryKey(Source, source.uuid)) {
      sourceRepo.upsert(realm, source, undefined);
    }
  }
  for (const sourceSet of response.entities.source_sets) {
    sourceSetRepo.upsert(
      realm,
      sourceSet,
      realm.objectForPrimaryKey(SourceSet, sourceSet.uuid) ?? undefined
    );
  }
  for (const sourceTrack of response.entities.source_tracks) {
    sourceTrackRepo.upsert(
      realm,
      sourceTrack,
      realm.objectForPrimaryKey(SourceTrack, sourceTrack.uuid) ?? undefined
    );
  }
  for (const song of response.entities.songs) {
    songRepo.upsert(realm, song, realm.objectForPrimaryKey(Song, song.uuid) ?? undefined);
  }

  attachRelationships(realm, response);
}

function attachRelationships(realm: Realm, response: CatalogResolveResponse) {
  for (const entity of response.entities.shows) {
    const show = realm.objectForPrimaryKey(Show, entity.uuid);
    if (!show) {
      continue;
    }

    const artist = realm.objectForPrimaryKey(Artist, show.artistUuid);
    if (!artist) {
      // A resolved show always carries its artist in the same normalized
      // response. Refuse a partial graph instead of leaving a stale artist
      // attached to a show whose artistUuid has changed.
      throw new Error(`Catalog resolver omitted artist ${show.artistUuid} for show ${show.uuid}.`);
    }
    if (show.artist?.uuid !== artist.uuid) {
      show.artist = artist;
    }

    const venue = show.venueUuid
      ? (realm.objectForPrimaryKey(Venue, show.venueUuid) ?? undefined)
      : undefined;
    if (show.venue?.uuid !== venue?.uuid) {
      show.venue = venue;
    }

    const tour = show.tourUuid
      ? (realm.objectForPrimaryKey(Tour, show.tourUuid) ?? undefined)
      : undefined;
    if (show.tour?.uuid !== tour?.uuid) {
      show.tour = tour;
    }
  }

  for (const entity of response.entities.sources) {
    const source = realm.objectForPrimaryKey(Source, entity.uuid);
    const artist = source && realm.objectForPrimaryKey(Artist, source.artistUuid);
    if (source && !source.artist && artist) {
      source.artist = artist;
    }
  }

  for (const entity of response.entities.source_sets) {
    const sourceSet = realm.objectForPrimaryKey(SourceSet, entity.uuid);
    const source = sourceSet && realm.objectForPrimaryKey(Source, sourceSet.sourceUuid);
    if (source && sourceSet && !source.sourceSets.some((value) => value.uuid === sourceSet.uuid)) {
      source.sourceSets.push(sourceSet);
    }
  }

  for (const entity of response.entities.source_tracks) {
    const track = realm.objectForPrimaryKey(SourceTrack, entity.uuid);
    if (!track) {
      continue;
    }

    const artist = realm.objectForPrimaryKey(Artist, track.artistUuid);
    const show = realm.objectForPrimaryKey(Show, track.showUuid);
    const year = show && realm.objectForPrimaryKey(Year, show.yearUuid);
    const source = realm.objectForPrimaryKey(Source, track.sourceUuid);
    const sourceSet = realm.objectForPrimaryKey(SourceSet, track.sourceSetUuid);
    if (!track.artist && artist) {
      track.artist = artist;
    }
    if (!track.show && show) {
      track.show = show;
    }
    if (!track.year && year) {
      track.year = year;
    }
    if (!track.source && source) {
      track.source = source;
    }
    if (sourceSet && !sourceSet.sourceTracks.some((value) => value.uuid === track.uuid)) {
      sourceSet.sourceTracks.push(track);
    }
  }
}
