import Realm from 'realm';
import { RelistenApiClient } from '@/relisten/api/client';
import {
  CatalogReferenceRequest,
  CatalogResolveRequest,
  CatalogResolveResponse,
} from '@/relisten/api/models/catalog_resolve';
import {
  FavoriteAccountScopeCapture,
  FavoriteRepository,
} from '@/relisten/library/favorite_repository';
import { Artist } from '@/relisten/realm/models/artist';
import { FavoriteCatalogType, UserFavorite } from '@/relisten/realm/models/library';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { Source } from '@/relisten/realm/models/source';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { Tour } from '@/relisten/realm/models/tour';
import { Venue } from '@/relisten/realm/models/venue';
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
    const references = this.referencesNeedingMetadata(capture);
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

  private referencesNeedingMetadata(capture: FavoriteAccountScopeCapture) {
    if (!this.repository.isCaptureCurrent(capture)) {
      return [];
    }

    const references = new Map<string, CatalogReferenceRequest>();
    const favorites = this.repository.realm
      .objects(UserFavorite)
      .filtered('scopeId == $0 AND effectivePresent == true', capture.scopeId);

    for (const favorite of favorites) {
      if (!this.hasRequiredMetadata(favorite)) {
        references.set(targetKey(favorite), {
          catalog_type: favorite.catalogType,
          catalog_uuid: favorite.catalogUuid,
        });
      }
    }

    return [...references.values()];
  }

  private favoriteIsActive(
    capture: FavoriteAccountScopeCapture,
    reference: CatalogReferenceRequest
  ) {
    return (
      this.repository.favoriteForTarget(capture.scopeId, {
        catalogType: reference.catalog_type,
        catalogUuid: reference.catalog_uuid,
      })?.effectivePresent === true
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

  private hasRequiredMetadata(reference: {
    catalogType: FavoriteCatalogType;
    catalogUuid: string;
  }) {
    const realm = this.repository.realm;

    // A child row by itself is not enough to render My Library. Resolver
    // responses include these shallow parents, so ask again when an older or
    // partial local catalog has the favorite but not the graph it projects to.
    if (reference.catalogType === 'source') {
      const source = realm.objectForPrimaryKey(Source, reference.catalogUuid);
      return !!source && this.hasShowMetadata(source.showUuid);
    }
    if (reference.catalogType === 'source_track') {
      const track = realm.objectForPrimaryKey(SourceTrack, reference.catalogUuid);
      return !!track && this.hasShowMetadata(track.showUuid);
    }
    if (reference.catalogType === 'show') {
      return this.hasShowMetadata(reference.catalogUuid);
    }
    if (reference.catalogType === 'song') {
      const song = realm.objectForPrimaryKey(Song, reference.catalogUuid);
      return !!song && !!realm.objectForPrimaryKey(Artist, song.artistUuid);
    }
    if (reference.catalogType === 'tour') {
      const tour = realm.objectForPrimaryKey(Tour, reference.catalogUuid);
      return !!tour && !!realm.objectForPrimaryKey(Artist, tour.artistUuid);
    }
    if (reference.catalogType === 'venue') {
      const venue = realm.objectForPrimaryKey(Venue, reference.catalogUuid);
      return !!venue && !!realm.objectForPrimaryKey(Artist, venue.artistUuid);
    }

    return !!realm.objectForPrimaryKey(Artist, reference.catalogUuid);
  }

  private hasShowMetadata(showUuid: string) {
    const realm = this.repository.realm;
    const show = realm.objectForPrimaryKey(Show, showUuid);
    return (
      !!show &&
      !!realm.objectForPrimaryKey(Artist, show.artistUuid) &&
      !!realm.objectForPrimaryKey(Year, show.yearUuid)
    );
  }
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

function targetKey(reference: {
  catalogType?: FavoriteCatalogType;
  catalogUuid?: string;
  catalog_type?: FavoriteCatalogType;
  catalog_uuid?: string;
}) {
  return `${reference.catalogType ?? reference.catalog_type}:${reference.catalogUuid ?? reference.catalog_uuid}`;
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : 'unknown_error';
}
