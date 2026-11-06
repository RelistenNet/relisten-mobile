import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { RelistenApiClient } from '@/relisten/api/client';
import type {
  CatalogReferenceRequest,
  CatalogResolveResponse,
} from '@/relisten/api/catalog/resolve';
import { Artist } from '@/relisten/realm/models/artist';
import { UserFavorite } from '@/relisten/realm/models/library';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Tour } from '@/relisten/realm/models/tour';
import { NormalizedSong, NormalizedVenue } from '@/relisten/realm/models/catalog';
import { Venue } from '@/relisten/realm/models/venue';
import { Year } from '@/relisten/realm/models/year';
import { applyCatalogResolutions } from '@/relisten/realm/catalog_identity';
import { applyResolvedEntities } from '@/relisten/realm/catalog_apply';
import { log } from '@/relisten/util/logging';
import {
  catalogIdForFavoriteTarget,
  isFavoriteTarget,
  type FavoriteTarget,
} from './favorite_catalog_target';
import type { FavoriteAccountScopeCapture, FavoriteRepository } from './favorite_repository';

const logger = log.extend('favorite-catalog');
const MAX_REFERENCES_PER_REQUEST = 500;

/** Refreshes catalog metadata and redirects without changing saved favorite targets. */
export class FavoriteMetadataHydrator {
  constructor(
    private readonly repository: FavoriteRepository,
    private readonly catalogApi: RelistenApiClient
  ) {}

  private pending?: Promise<void>;
  private requested?: FavoriteAccountScopeCapture;

  refresh = (capture = this.repository.captureScope()): Promise<void> => {
    this.requested = capture;
    if (!this.pending) {
      this.pending = this.flush().finally(() => {
        this.pending = undefined;
        // A membership change can arrive between the loop finishing and this callback.
        if (this.requested) void this.refresh(this.requested);
      });
    }
    return this.pending;
  };

  private async flush() {
    while (this.requested) {
      const capture = this.requested;
      this.requested = undefined;
      await this.hydrate(capture);
    }
  }

  private async hydrate(capture: FavoriteAccountScopeCapture) {
    if (this.repository.realm.isClosed || !this.repository.isCaptureCurrent(capture)) {
      return;
    }

    const references = this.referencesToRefresh(capture);
    for (let offset = 0; offset < references.length; offset += MAX_REFERENCES_PER_REQUEST) {
      if (this.repository.realm.isClosed || !this.repository.isCaptureCurrent(capture)) {
        return;
      }

      const batch = references
        .slice(offset, offset + MAX_REFERENCES_PER_REQUEST)
        .filter(
          (target) =>
            this.repository.favoriteForTarget(capture.scopeId, target)?.effectivePresent === true
        );
      if (batch.length === 0) {
        continue;
      }

      try {
        const response = await this.catalogApi.resolveCatalogReferences(batch);
        if (response.error || !response.data) {
          throw response.error?.error ?? new Error('Catalog resolver request failed.');
        }
        validateResponse(batch, response.data);

        // Resolver patches omit artists held in the shared list. Delay importing
        // its hook-bearing module until root services have initialized.
        const { ensureCatalogArtist } = await import('@/relisten/realm/models/artist_repo');
        const entities = response.data.entities;
        const returnedArtists = new Set(entities.artists.map((artist) => artist.id));
        const dependentRows = [
          ...entities.years,
          ...entities.tours,
          ...entities.imported_venues,
          ...entities.imported_songs,
          ...entities.artist_venues,
          ...entities.shows,
          ...entities.sources,
          ...entities.source_sets,
          ...entities.tracks,
          ...entities.songs,
        ];
        const artistIds = new Set(dependentRows.map((row) => row.artist_id));
        await Promise.all(
          [...artistIds]
            .filter((id) => !returnedArtists.has(id))
            .map((id) =>
              ensureCatalogArtist(
                this.repository.realm,
                this.catalogApi,
                decodeUuidCatalogId(id, 'artist')
              )
            )
        );
        if (this.repository.realm.isClosed || !this.repository.isCaptureCurrent(capture)) {
          return;
        }

        this.repository.realm.write(() => {
          applyResolvedEntities(this.repository.realm, entities);
          applyCatalogResolutions(this.repository.realm, response.data!.references);
        });
      } catch (error) {
        // Membership and its sync cursor stay durable when metadata cannot load.
        logger.warn(
          `Catalog metadata was not applied: ${error instanceof Error ? error.name : 'unknown_error'}`
        );
      }
    }
  }

  private referencesToRefresh(capture: FavoriteAccountScopeCapture) {
    const references = new Map<string, CatalogReferenceRequest>();
    const favorites = this.repository.realm
      .objects(UserFavorite)
      .filtered('scopeId == $0 AND effectivePresent == true', capture.scopeId);

    for (const favorite of favorites) {
      const target = { kind: favorite.targetKind, id: favorite.targetId };
      const canonical = target.kind === 'song' || target.kind === 'venue';
      if (canonical || !this.hasMetadata(target)) {
        references.set(`${target.kind}:${target.id}`, { ...target, scheme: 'v4' });
      }
    }

    return [...references.values()];
  }

  private hasMetadata(target: FavoriteTarget): boolean {
    const realm = this.repository.realm;
    const id = catalogIdForFavoriteTarget(target);
    if (!id) {
      return false;
    }

    switch (target.kind) {
      case 'venue':
        return realm.objectForPrimaryKey(NormalizedVenue, id) !== null;
      case 'song': {
        const song = realm.objectForPrimaryKey(NormalizedSong, id);
        return song !== null && this.hasArtist(song.artistUuid);
      }
      case 'artist':
        return this.hasArtist(id);
      case 'show':
        return this.hasShow(id);
      case 'source': {
        const source = realm.objectForPrimaryKey(Source, id);
        return isActive(source) && this.hasShow(source.showUuid);
      }
      case 'track': {
        const track = realm.objectForPrimaryKey(SourceTrack, id);
        return isActive(track) && this.hasShow(track.showUuid);
      }
      case 'imported_song': {
        const song = realm.objectForPrimaryKey(Song, id);
        return song !== null && this.hasArtist(song.artistUuid);
      }
      case 'imported_venue': {
        const venue = realm.objectForPrimaryKey(Venue, id);
        return venue !== null && this.hasArtist(venue.artistUuid);
      }
      case 'tour': {
        const tour = realm.objectForPrimaryKey(Tour, id);
        return isActive(tour) && this.hasArtist(tour.artistUuid);
      }
    }
  }

  private hasArtist(uuid: string) {
    return isActive(this.repository.realm.objectForPrimaryKey(Artist, uuid));
  }

  private hasShow(uuid: string) {
    const realm = this.repository.realm;
    const show = realm.objectForPrimaryKey(Show, uuid);
    return (
      isActive(show) &&
      this.hasArtist(show.artistUuid) &&
      (!show.yearUuid || isActive(realm.objectForPrimaryKey(Year, show.yearUuid)))
    );
  }
}

function isActive<T extends { deletedAt?: Date }>(row: T | null): row is T {
  return row !== null && row.deletedAt == null;
}

function validateResponse(request: CatalogReferenceRequest[], response: CatalogResolveResponse) {
  if (response.references.length !== request.length) {
    throw new Error('Catalog resolver omitted requested references.');
  }

  for (let index = 0; index < request.length; index++) {
    const expected = request[index];
    const actual = response.references[index];
    if (actual.scheme !== 'v4' || actual.id !== expected.id || actual.kind !== expected.kind) {
      throw new Error('Catalog resolver returned an unexpected reference.');
    }

    if (actual.availability === 'available' || actual.availability === 'redirected') {
      if (!isFavoriteTarget(actual.target) || actual.target.kind !== actual.kind) {
        throw new Error('Catalog resolver returned an invalid target.');
      }
    } else if (actual.availability !== 'unavailable' && actual.availability !== 'retired') {
      throw new Error('Catalog resolver returned an unknown availability.');
    }
  }
}
