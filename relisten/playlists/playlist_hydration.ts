import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import Realm from 'realm';
import { refreshStaleGuideMarkdown } from '@/relisten/playlists/guide/guide_rows';
import type { RelistenApiClient } from '@/relisten/api/client';
import type { CatalogReferenceResolution } from '@/relisten/api/catalog/resolve';
import { useRelistenApi } from '@/relisten/api/context';
import {
  MAX_REFERENCES_PER_REQUEST,
  resolveCatalogBatch,
} from '@/relisten/realm/catalog_resolution';
import { PlaylistTrackAvailability } from '@/relisten/realm/models/playlists/playlist';
import { useRealm } from '@/relisten/realm/schema';
import type { PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';
import { log } from '@/relisten/util/logging';

const logger = log.extend('playlist-catalog');

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
    const batch = unique
      .slice(offset, offset + MAX_REFERENCES_PER_REQUEST)
      .map((id) => ({ kind: 'track' as const, id, scheme: 'v4' as const }));
    try {
      await resolveCatalogBatch(realm, catalogApi, batch, {
        applyAlso: (references) => {
          const now = new Date();
          for (const reference of references) {
            availability.set(reference.id, reference.availability);
            recordAvailability(realm, reference, now);
          }
        },
      });
    } catch (error) {
      logger.warn(
        `Playlist tracks were not resolved: ${error instanceof Error ? error.name : 'unknown_error'}`
      );
    }
  }
  // Notes link bare timestamps only once their track's duration is known.
  refreshStaleGuideMarkdown(realm);
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
      if (existing) {
        realm.delete(existing);
      }
  }
}

/**
 * Loads details for tracks this device hasn't seen yet. Cached tracks are never
 * re-checked here; a track is only re-checked when it fails to play. A request
 * that fails is tried again when the screen is next focused or the device comes
 * back online, never in a loop.
 */
export function usePlaylistHydration(
  playlistId: string,
  groups: PlaylistRowGroup[],
  online: boolean
) {
  const realm = useRealm();
  const { apiClient } = useRelistenApi();
  const focused = useIsFocused();
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!online || !focused) {
      return;
    }
    // Text blocks have no track, so only `loading` tracks are fetched.
    const missing = groups
      .flatMap((g) => g.entries)
      .flatMap((row) => (row.status === 'loading' && row.entry.trackId ? [row.entry.trackId] : []))
      .filter((trackId) => !inFlight.current.has(trackId));
    if (missing.length === 0) {
      return;
    }

    missing.forEach((id) => inFlight.current.add(id));
    void resolvePlaylistTracks(realm, apiClient, missing).finally(() => {
      missing.forEach((id) => inFlight.current.delete(id));
    });
  }, [apiClient, focused, groups, online, playlistId, realm]);
}
