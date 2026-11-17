import Realm from 'realm';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { RelistenApiClient } from '@/relisten/api/client';
import type { CatalogResolveResponse } from '@/relisten/api/catalog/resolve';

/**
 * Resolver responses omit artists the shared artist list already holds. Before
 * applying a response, make sure every artist its rows depend on is in Realm.
 */
export async function ensureResolverArtists(
  realm: Realm,
  catalogApi: RelistenApiClient,
  entities: CatalogResolveResponse['entities']
) {
  // Delay importing the hook-bearing module until root services have initialized.
  const { ensureCatalogArtist } = await import('@/relisten/realm/models/artist_repo');
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
      .map((id) => ensureCatalogArtist(realm, catalogApi, decodeUuidCatalogId(id, 'artist')))
  );
}
