import Realm from 'realm';
import { RelistenApiClient } from '@/relisten/api/client';
import {
  CatalogReferenceRequest,
  CatalogResolveRequest,
  CatalogResolveResponse,
} from '@/relisten/api/models/catalog_resolve';
import type {
  V4CatalogReferenceRequest,
  V4CatalogResolveResponse,
} from '@/relisten/api/v4/catalog_resolve';
import {
  FavoriteAccountScopeCapture,
  FavoriteRepository,
} from '@/relisten/library/favorite_repository';
import {
  catalogReferenceForFavoriteTarget,
  favoriteTargetForCatalogId,
  favoriteTargetForCatalogReference,
} from '@/relisten/library/favorite_catalog_target';
import { Artist } from '@/relisten/realm/models/artist';
import { UserFavorite } from '@/relisten/realm/models/library';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Tour } from '@/relisten/realm/models/tour';
import { Venue } from '@/relisten/realm/models/venue';
import { NormalizedSong, NormalizedVenue } from '@/relisten/realm/models/v4_catalog';
import { applyV4NormalizedSong, applyV4NormalizedVenue } from '@/relisten/realm/v4_catalog_apply';
import { Year } from '@/relisten/realm/models/year';
import { log } from '@/relisten/util/logging';

const logger = log.extend('favorite-metadata');
const MAX_REFERENCES_PER_REQUEST = 500;

type CatalogEntityApplier = (realm: Realm, response: CatalogResolveResponse) => void;

/** Best-effort catalog hydration for active favorites missing local metadata. */
export class FavoriteMetadataHydrator {
  constructor(
    private readonly repository: FavoriteRepository,
    private readonly catalogApi: RelistenApiClient
  ) {}

  async hydrateMissing(capture: FavoriteAccountScopeCapture) {
    await this.hydrateMissingV3(capture);
    if (this.catalogApi.usesV4Catalog()) {
      await this.hydrateMissingV4(capture);
    }
  }

  private async hydrateMissingV3(capture: FavoriteAccountScopeCapture) {
    const references = this.v3ReferencesNeedingMetadata(capture);
    let applyCatalogEntities: CatalogEntityApplier | undefined;

    for (let offset = 0; offset < references.length; offset += MAX_REFERENCES_PER_REQUEST) {
      if (!this.repository.isCaptureCurrent(capture)) {
        return;
      }

      const batch = references
        .slice(offset, offset + MAX_REFERENCES_PER_REQUEST)
        .filter((reference) => this.favoriteIsActive(capture, reference));
      if (batch.length === 0) {
        continue;
      }
      const response = await this.catalogApi.resolveCatalogReferences(batch);
      if (!response.data || response.error) {
        logger.warn(`catalog resolver failed for ${batch.length} favorite references`);
        continue;
      }

      try {
        // Catalog repositories also export React hooks that eventually depend
        // on root services. Loading their applier after startup keeps that
        // ordinary UI graph out of root-service module initialization.
        applyCatalogEntities ??= (await import('@/relisten/library/favorite_catalog_applier'))
          .applyResolvedCatalogEntities;
        this.applyResponse(capture, batch, response.data, applyCatalogEntities);
      } catch (error) {
        // Membership and its sync cursor are already durable. Bad or unavailable
        // catalog metadata must not roll either one back.
        logger.warn(`catalog resolver response was not applied: ${errorName(error)}`);
      }
    }
  }

  private async hydrateMissingV4(capture: FavoriteAccountScopeCapture) {
    const references = this.v4ReferencesNeedingMetadata(capture);

    for (let offset = 0; offset < references.length; offset += MAX_REFERENCES_PER_REQUEST) {
      if (!this.repository.isCaptureCurrent(capture)) {
        return;
      }

      const batch = references
        .slice(offset, offset + MAX_REFERENCES_PER_REQUEST)
        .filter((reference) => this.v4FavoriteIsActive(capture, reference));
      if (batch.length === 0) {
        continue;
      }

      const response = await this.catalogApi.resolveV4CatalogReferences(batch);
      if (!response.data || response.error) {
        logger.warn(`v4 catalog resolver failed for ${batch.length} favorite references`);
        continue;
      }

      try {
        validateV4Response(batch, response.data);
        if (response.data.entities.songs.length > 0) {
          await this.catalogApi.refreshV4Artists(false);
          if (!this.repository.isCaptureCurrent(capture)) {
            return;
          }
        }
        this.applyV4Response(capture, response.data);
      } catch (error) {
        logger.warn(`v4 catalog resolver response was not applied: ${errorName(error)}`);
      }
    }
  }

  private v3ReferencesNeedingMetadata(capture: FavoriteAccountScopeCapture) {
    if (!this.repository.isCaptureCurrent(capture)) {
      return [];
    }

    const references = new Map<string, CatalogReferenceRequest>();
    const favorites = this.repository.realm
      .objects(UserFavorite)
      .filtered('scopeId == $0 AND effectivePresent == true', capture.scopeId);

    for (const favorite of favorites) {
      const reference = catalogReferenceForFavoriteTarget({
        kind: favorite.targetKind,
        id: favorite.targetId,
      });
      if (reference && !this.hasRequiredMetadata(reference)) {
        references.set(targetKey(reference), reference);
      }
    }

    return [...references.values()];
  }

  private v4ReferencesNeedingMetadata(capture: FavoriteAccountScopeCapture) {
    if (!this.repository.isCaptureCurrent(capture)) {
      return [];
    }

    const references = new Map<string, V4CatalogReferenceRequest>();
    const favorites = this.repository.realm
      .objects(UserFavorite)
      .filtered('scopeId == $0 AND effectivePresent == true', capture.scopeId);

    for (const favorite of favorites) {
      if (favorite.targetKind !== 'song' && favorite.targetKind !== 'venue') {
        continue;
      }

      const reference: V4CatalogReferenceRequest = {
        kind: favorite.targetKind,
        scheme: 'v4',
        id: favorite.targetId,
      };
      if (!this.hasV4RequiredMetadata(reference)) {
        references.set(v4TargetKey(reference), reference);
      }
    }

    return [...references.values()];
  }

  private favoriteIsActive(
    capture: FavoriteAccountScopeCapture,
    reference: CatalogReferenceRequest
  ) {
    return (
      this.repository.favoriteForTarget(
        capture.scopeId,
        favoriteTargetForCatalogReference(reference)
      )?.effectivePresent === true
    );
  }

  private v4FavoriteIsActive(
    capture: FavoriteAccountScopeCapture,
    reference: V4CatalogReferenceRequest
  ) {
    return (
      this.repository.favoriteForTarget(
        capture.scopeId,
        favoriteTargetForCatalogId(reference.kind, reference.id)
      )?.effectivePresent === true
    );
  }

  private applyResponse(
    capture: FavoriteAccountScopeCapture,
    request: CatalogResolveRequest['references'],
    response: CatalogResolveResponse,
    applyCatalogEntities: CatalogEntityApplier
  ) {
    if (!this.repository.isCaptureCurrent(capture)) {
      return;
    }
    validateResponse(request, response);

    const realm = this.repository.realm;
    realm.write(() => {
      if (!this.repository.isCaptureCurrent(capture)) {
        return;
      }

      applyCatalogEntities(realm, response);
    });
  }

  private applyV4Response(
    capture: FavoriteAccountScopeCapture,
    response: V4CatalogResolveResponse
  ) {
    if (!this.repository.isCaptureCurrent(capture)) {
      return;
    }

    const realm = this.repository.realm;
    realm.write(() => {
      if (!this.repository.isCaptureCurrent(capture)) {
        return;
      }

      for (const venue of response.entities.venues) {
        applyV4NormalizedVenue(realm, venue);
      }
      for (const song of response.entities.songs) {
        applyV4NormalizedSong(realm, song);
      }
    });
  }

  private hasRequiredMetadata(reference: CatalogReferenceRequest) {
    const realm = this.repository.realm;

    // A child row by itself is not enough to render My Library. Resolver
    // responses include these shallow parents, so ask again when an older or
    // partial local catalog has the favorite but not the graph it projects to.
    if (reference.catalog_type === 'source') {
      const source = realm.objectForPrimaryKey(Source, reference.catalog_uuid);
      return isActiveCatalogObject(source) && this.hasShowMetadata(source.showUuid);
    }
    if (reference.catalog_type === 'source_track') {
      const track = realm.objectForPrimaryKey(SourceTrack, reference.catalog_uuid);
      return isActiveCatalogObject(track) && this.hasShowMetadata(track.showUuid);
    }
    if (reference.catalog_type === 'show') {
      return this.hasShowMetadata(reference.catalog_uuid);
    }
    if (reference.catalog_type === 'song') {
      const song = realm.objectForPrimaryKey(Song, reference.catalog_uuid);
      return isActiveCatalogObject(song) && this.hasArtistMetadata(song.artistUuid);
    }
    if (reference.catalog_type === 'tour') {
      const tour = realm.objectForPrimaryKey(Tour, reference.catalog_uuid);
      return isActiveCatalogObject(tour) && this.hasArtistMetadata(tour.artistUuid);
    }
    if (reference.catalog_type === 'venue') {
      const venue = realm.objectForPrimaryKey(Venue, reference.catalog_uuid);
      return isActiveCatalogObject(venue) && this.hasArtistMetadata(venue.artistUuid);
    }

    return this.hasArtistMetadata(reference.catalog_uuid);
  }

  private hasV4RequiredMetadata(reference: V4CatalogReferenceRequest) {
    if (reference.kind === 'venue') {
      return this.repository.realm.objectForPrimaryKey(NormalizedVenue, reference.id) != null;
    }

    return this.repository.realm.objectForPrimaryKey(NormalizedSong, reference.id) != null;
  }

  private hasShowMetadata(showUuid: string) {
    const realm = this.repository.realm;
    const show = realm.objectForPrimaryKey(Show, showUuid);
    return (
      isActiveCatalogObject(show) &&
      this.hasArtistMetadata(show.artistUuid) &&
      (!show.yearUuid || isActiveCatalogObject(realm.objectForPrimaryKey(Year, show.yearUuid)))
    );
  }

  private hasArtistMetadata(artistUuid: string) {
    return isActiveCatalogObject(this.repository.realm.objectForPrimaryKey(Artist, artistUuid));
  }
}

function isActiveCatalogObject<T extends { deletedAt?: Date }>(object: T | null): object is T {
  // Tombstones retain their primary keys. Treat them as missing metadata so an
  // authoritative resolver upsert can restore the same object by UUID.
  return object != null && object.deletedAt == null;
}

function validateResponse(
  request: ReadonlyArray<CatalogReferenceRequest>,
  response: CatalogResolveResponse
) {
  if (response.contract_version !== 1 || Number.isNaN(new Date(response.checked_at).valueOf())) {
    throw new Error('Unsupported catalog resolver response.');
  }
  if (response.references.length !== request.length) {
    throw new Error('The catalog resolver response is missing requested references.');
  }

  const expected = new Set(request.map(targetKey));
  const seen = new Set<string>();
  for (const reference of response.references) {
    const key = targetKey(reference);
    if (
      !expected.has(key) ||
      seen.has(key) ||
      (reference.availability !== 'available' && reference.availability !== 'unavailable')
    ) {
      throw new Error('The catalog resolver response contains an invalid reference.');
    }
    seen.add(key);
  }
}

function validateV4Response(
  request: ReadonlyArray<V4CatalogReferenceRequest>,
  response: V4CatalogResolveResponse
) {
  if (response.references.length !== request.length) {
    throw new Error('The v4 catalog resolver response is missing requested references.');
  }

  const expected = new Set(request.map(v4TargetKey));
  const seen = new Set<string>();
  const availableTargets = new Set<string>();
  for (const reference of response.references) {
    const key = v4TargetKey(reference);
    if (
      reference.scheme !== 'v4' ||
      !expected.has(key) ||
      seen.has(key) ||
      (reference.availability !== 'available' &&
        reference.availability !== 'redirected' &&
        reference.availability !== 'unavailable' &&
        reference.availability !== 'retired')
    ) {
      throw new Error('The v4 catalog resolver response contains an invalid reference.');
    }
    seen.add(key);

    if (reference.availability === 'available' || reference.availability === 'redirected') {
      if (!reference.target || reference.target.kind !== reference.kind) {
        throw new Error('The v4 catalog resolver returned an invalid resolvable target.');
      }
      availableTargets.add(`${reference.target.kind}:${reference.target.id}`);
    }
  }

  for (const venue of response.entities.venues) {
    if (!availableTargets.has(`venue:${venue.id}`)) {
      throw new Error('The v4 catalog resolver returned an unrelated venue patch.');
    }
  }
  for (const song of response.entities.songs) {
    if (!availableTargets.has(`song:${song.id}`)) {
      throw new Error('The v4 catalog resolver returned an unrelated song patch.');
    }
  }
}

function targetKey(reference: CatalogReferenceRequest) {
  return `${reference.catalog_type}:${reference.catalog_uuid}`;
}

function v4TargetKey(reference: Pick<V4CatalogReferenceRequest, 'kind' | 'id'>) {
  return `${reference.kind}:${reference.id}`;
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : 'unknown_error';
}
