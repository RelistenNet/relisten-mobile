import type { RelistenApiClient } from '@/relisten/api/client';
import type {
  V4CatalogReferenceRequest,
  V4CatalogResolveResponse,
} from '@/relisten/api/v4/catalog_resolve';
import { Artist } from '@/relisten/realm/models/artist';
import { UserFavorite } from '@/relisten/realm/models/library';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Tour } from '@/relisten/realm/models/tour';
import { NormalizedSong, NormalizedVenue } from '@/relisten/realm/models/v4_catalog';
import { Venue } from '@/relisten/realm/models/venue';
import { Year } from '@/relisten/realm/models/year';
import { applyV4ResolvedEntities } from '@/relisten/realm/v4_catalog_apply';
import { log } from '@/relisten/util/logging';
import {
  catalogIdForFavoriteTarget,
  isFavoriteTarget,
  type FavoriteTarget,
} from './favorite_catalog_target';
import type { FavoriteAccountScopeCapture, FavoriteRepository } from './favorite_repository';

const logger = log.extend('favorite-metadata');
const MAX_REFERENCES_PER_REQUEST = 500;

/** Hydrates catalog metadata without changing saved favorite membership. */
export class FavoriteMetadataHydrator {
  constructor(
    private readonly repository: FavoriteRepository,
    private readonly catalogApi: RelistenApiClient
  ) {}

  async hydrateMissing(capture: FavoriteAccountScopeCapture) {
    if (!this.repository.isCaptureCurrent(capture)) {
      return;
    }

    const references = this.referencesNeedingMetadata(capture);
    for (let offset = 0; offset < references.length; offset += MAX_REFERENCES_PER_REQUEST) {
      if (!this.repository.isCaptureCurrent(capture)) {
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
        await ensureCatalogArtist(this.repository.realm, this.catalogApi);
        if (!this.repository.isCaptureCurrent(capture)) {
          return;
        }

        const entities = response.data.entities;
        this.repository.realm.write(() => {
          applyV4ResolvedEntities(this.repository.realm, entities);
        });
      } catch (error) {
        // Membership and its sync cursor stay durable when metadata cannot load.
        logger.warn(
          `Catalog metadata was not applied: ${error instanceof Error ? error.name : 'unknown_error'}`
        );
      }
    }
  }

  private referencesNeedingMetadata(capture: FavoriteAccountScopeCapture) {
    const references = new Map<string, V4CatalogReferenceRequest>();
    const favorites = this.repository.realm
      .objects(UserFavorite)
      .filtered('scopeId == $0 AND effectivePresent == true', capture.scopeId);

    for (const favorite of favorites) {
      const target = { kind: favorite.targetKind, id: favorite.targetId };
      if (!this.hasMetadata(target)) {
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
        return isActive(song) && this.hasArtist(song.artistUuid);
      }
      case 'imported_venue': {
        const venue = realm.objectForPrimaryKey(Venue, id);
        return isActive(venue) && this.hasArtist(venue.artistUuid);
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

function validateResponse(
  request: V4CatalogReferenceRequest[],
  response: V4CatalogResolveResponse
) {
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
