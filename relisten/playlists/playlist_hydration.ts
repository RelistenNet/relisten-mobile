import { useEffect, useRef } from 'react';
import Realm from 'realm';
import type { RelistenApiClient } from '@/relisten/api/client';
import type { CatalogReferenceResolution } from '@/relisten/api/catalog/resolve';
import { useRelistenApi } from '@/relisten/api/context';
import { applyResolvedEntities } from '@/relisten/realm/catalog_apply';
import { applyCatalogResolutions } from '@/relisten/realm/catalog_identity';
import { PlaylistTrackAvailability } from '@/relisten/realm/models/playlists/playlist';
import { ensureResolverArtists } from '@/relisten/realm/resolver_artists';
import { useRealm } from '@/relisten/realm/schema';
import type { PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';
import { log } from '@/relisten/util/logging';

const logger = log.extend('playlist-catalog');
const MAX_REFERENCES_PER_REQUEST = 500;

/**
 * Asks the catalog about tracks and records what it says. Returned metadata is
 * upserted; recordings reported `unavailable` or `retired` are remembered so the
 * playlist can label and skip them. Nothing is ever removed from a playlist, and
 * a failed request changes nothing. Returns each track's availability.
 */
export async function resolvePlaylistTracks(
  realm: Realm,
  catalogApi: RelistenApiClient,
  trackIds: string[]
): Promise<Map<string, CatalogReferenceResolution['availability']>> {
  const availability = new Map<string, CatalogReferenceResolution['availability']>();
  const unique = [...new Set(trackIds)];

  for (let offset = 0; offset < unique.length; offset += MAX_REFERENCES_PER_REQUEST) {
    const batch = unique.slice(offset, offset + MAX_REFERENCES_PER_REQUEST);
    try {
      const response = await catalogApi.resolveCatalogReferences(
        batch.map((id) => ({ kind: 'track' as const, id, scheme: 'v4' as const }))
      );
      if (response.error || !response.data) {
        throw response.error?.error ?? new Error('Catalog resolver request failed.');
      }
      const { entities, references } = response.data;
      await ensureResolverArtists(realm, catalogApi, entities);
      if (realm.isClosed) return availability;

      realm.write(() => {
        applyResolvedEntities(realm, entities);
        applyCatalogResolutions(realm, references);
        const now = new Date();
        for (const reference of references) {
          availability.set(reference.id, reference.availability);
          recordAvailability(realm, reference, now);
        }
      });
    } catch (error) {
      logger.warn(
        `Playlist tracks were not resolved: ${error instanceof Error ? error.name : 'unknown_error'}`
      );
    }
  }
  return availability;
}

/** Remembers a gone or redirected track; an available track clears any old record. */
function recordAvailability(realm: Realm, reference: CatalogReferenceResolution, now: Date) {
  const existing = realm.objectForPrimaryKey(PlaylistTrackAvailability, reference.id);
  switch (reference.availability) {
    case 'unavailable':
    case 'retired':
      realm.create(
        PlaylistTrackAvailability,
        { trackId: reference.id, status: 'unavailable', checkedAt: now },
        Realm.UpdateMode.Modified
      );
      return;
    case 'redirected':
      realm.create(
        PlaylistTrackAvailability,
        {
          trackId: reference.id,
          status: 'redirected',
          redirectTrackId: reference.target?.id,
          checkedAt: now,
        },
        Realm.UpdateMode.Modified
      );
      return;
    case 'available':
      if (existing) realm.delete(existing);
  }
}

/**
 * Loads details for tracks this device hasn't seen yet, once per visit. Cached
 * tracks are never re-checked; a track is only re-checked when it fails to play.
 */
export function usePlaylistHydration(
  playlistId: string,
  groups: PlaylistRowGroup[],
  online: boolean
) {
  const realm = useRealm();
  const { apiClient } = useRelistenApi();
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (!online) return;
    const missing = groups
      .flatMap((g) => g.entries)
      .filter((row) => row.status === 'loading' && !requested.current.has(row.entry.trackId))
      .map((row) => row.entry.trackId);
    if (missing.length === 0) return;

    missing.forEach((id) => requested.current.add(id));
    void resolvePlaylistTracks(realm, apiClient, missing);
  }, [apiClient, groups, online, playlistId, realm]);
}
