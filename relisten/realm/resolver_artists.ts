import Realm from 'realm';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { RelistenApiClient } from '@/relisten/api/client';
import type { CatalogResolveResponse } from '@/relisten/api/catalog/resolve';

type Entities = CatalogResolveResponse['entities'];

/** Every entity kind whose rows name the artist they belong to. */
const ARTIST_OWNED_KINDS = [
  'years',
  'tours',
  'imported_venues',
  'imported_songs',
  'artist_venues',
  'shows',
  'sources',
  'source_sets',
  'tracks',
  'songs',
] as const satisfies readonly (keyof Entities)[];

/**
 * Resolver responses omit artists the shared artist list already holds. Before
 * applying a response, make sure every artist its rows depend on is in Realm.
 * Reads each row's artist ID in place, without copying the response, and asks
 * for each missing artist once; concurrent requests share one list refresh.
 */
export async function ensureResolverArtists(
  realm: Realm,
  catalogApi: RelistenApiClient,
  entities: Entities
) {
  const seen = new Set<string>(entities.artists.map((artist) => artist.id));
  const needed: string[] = [];
  for (const kind of ARTIST_OWNED_KINDS) {
    for (const row of entities[kind]) {
      if (!seen.has(row.artist_id)) {
        seen.add(row.artist_id);
        needed.push(row.artist_id);
      }
    }
  }
  if (needed.length === 0) {
    return;
  }

  // Delay importing the hook-bearing module until root services have initialized.
  const { ensureCatalogArtist } = await import('@/relisten/realm/models/artist_repo');
  await Promise.all(
    needed.map((id) => ensureCatalogArtist(realm, catalogApi, decodeUuidCatalogId(id, 'artist')))
  );
}
