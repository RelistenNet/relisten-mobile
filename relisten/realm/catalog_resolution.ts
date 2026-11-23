import Realm from 'realm';
import type { RelistenApiClient } from '@/relisten/api/client';
import type {
  CatalogReferenceRequest,
  CatalogReferenceResolution,
  CatalogResolveResponse,
} from '@/relisten/api/catalog/resolve';
import { applyResolvedEntities } from '@/relisten/realm/catalog_apply';
import { applyCatalogResolutions } from '@/relisten/realm/catalog_identity';
import { ensureResolverArtists } from '@/relisten/realm/resolver_artists';

/** The catalog resolver's cap on references per request. */
export const MAX_REFERENCES_PER_REQUEST = 500;

/**
 * Resolves one batch of catalog references (at most `MAX_REFERENCES_PER_REQUEST`)
 * and stores what the catalog returned: entity metadata and identity redirects,
 * plus whatever `applyAlso` records, all in one write.
 *
 * The reply must answer exactly the requested references, in order, or nothing
 * is written. `checkBeforeApply` sees the validated reply before anything
 * reaches Realm and can refuse it by throwing; nothing is written then.
 * `isCurrent` is checked after the network calls; when it returns false (the
 * realm closed or the account changed) nothing is written and the result is
 * undefined. Request and validation failures throw.
 */
export async function resolveCatalogBatch(
  realm: Realm,
  catalogApi: RelistenApiClient,
  batch: CatalogReferenceRequest[],
  options: {
    isCurrent?: () => boolean;
    checkBeforeApply?: (response: CatalogResolveResponse) => void;
    applyAlso?: (references: CatalogReferenceResolution[]) => void;
  } = {}
): Promise<CatalogReferenceResolution[] | undefined> {
  const response = await catalogApi.resolveCatalogReferences(batch);
  if (response.error || !response.data) {
    throw response.error?.error ?? new Error('Catalog resolver request failed.');
  }
  validateResolverResponse(batch, response.data);
  options.checkBeforeApply?.(response.data);

  const { entities, references } = response.data;
  await ensureResolverArtists(realm, catalogApi, entities);
  if (realm.isClosed || (options.isCurrent && !options.isCurrent())) {
    return undefined;
  }

  realm.write(() => {
    applyResolvedEntities(realm, entities);
    applyCatalogResolutions(realm, references);
    options.applyAlso?.(references);
  });
  return references;
}

export function validateResolverResponse(
  request: CatalogReferenceRequest[],
  response: CatalogResolveResponse
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
      if (actual.target?.kind !== actual.kind || typeof actual.target.id !== 'string') {
        throw new Error('Catalog resolver returned an invalid target.');
      }
    } else if (actual.availability !== 'unavailable' && actual.availability !== 'retired') {
      throw new Error('Catalog resolver returned an unknown availability.');
    }
  }
}
