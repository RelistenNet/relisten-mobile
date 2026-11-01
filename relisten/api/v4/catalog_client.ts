import Realm from 'realm';

import { encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import { CatalogV4Coordinator } from '@/relisten/api/v4/catalog_coordinator';
import { CatalogV4ProtocolError, CatalogV4Transport } from '@/relisten/api/v4/catalog_transport';
import type {
  V4ArtistResource,
  V4ShowResource,
  V4SourceResource,
  V4TrackResource,
  V4YearResource,
  V4YearWithShowsResource,
} from '@/relisten/api/v4/wire_types';
import type { Artist } from '@/relisten/realm/models/artist';
import { CatalogQueryState } from '@/relisten/realm/models/v4_catalog';
import {
  applyV4ArtistYears,
  applyV4ArtistList,
  applyV4FullShow,
  applyV4FullSource,
  applyV4Track,
  applyV4Year,
  hasV4ArtistYears,
  hasV4Show,
  hasV4Source,
  hasV4Track,
  hasV4Year,
} from '@/relisten/realm/v4_catalog_apply';

const ARTIST_LIST_PATH = '/artists?include_autocreated=true';
const ARTIST_LIST_QUERY_KEY = `GET ${ARTIST_LIST_PATH}`;

function assertExpectedResourceId(path: string, expectedId: string, actualId: unknown) {
  if (actualId !== expectedId) {
    throw new CatalogV4ProtocolError(
      `V4 catalog response for ${path} returned ${String(actualId)} instead of ${expectedId}.`
    );
  }
}

/** Explicit mobile coverage for the catalog routes used by the staged v4 pilot. */
export class CatalogV4Client {
  private readonly coordinator: CatalogV4Coordinator;

  constructor(
    private readonly realm: Realm,
    transport = new CatalogV4Transport()
  ) {
    this.coordinator = new CatalogV4Coordinator(realm, transport);
  }

  refreshArtists(force = false): Promise<void> {
    return this.coordinator.refresh<V4ArtistResource[]>({
      queryKey: ARTIST_LIST_QUERY_KEY,
      path: ARTIST_LIST_PATH,
      force,
      hasLocalData: () => this.hasArtistList(),
      apply: (resources) => applyV4ArtistList(this.realm, resources),
    });
  }

  async refreshArtistYears(artistUuid: string, force = false): Promise<void> {
    await this.ensureArtist(artistUuid);

    const artistId = encodeV4UuidCatalogId(artistUuid, 'artist');
    const path = `/artists/${artistId}/years`;
    const queryKey = `GET ${path}`;

    return this.coordinator.refresh<V4YearResource[]>({
      queryKey,
      path,
      force,
      hasLocalData: () => hasV4ArtistYears(this.realm, artistUuid, this.resultIds(queryKey)),
      apply: (resources) => {
        for (const resource of resources) {
          assertExpectedResourceId(path, artistId, resource.artist_id);
        }
        return applyV4ArtistYears(this.realm, artistUuid, resources);
      },
    });
  }

  async refreshYear(artistUuid: string, yearUuid: string, force = false): Promise<void> {
    await this.ensureArtist(artistUuid);

    const artistId = encodeV4UuidCatalogId(artistUuid, 'artist');
    const yearId = encodeV4UuidCatalogId(yearUuid, 'year');
    const path = `/artists/${artistId}/years/${yearId}`;
    const queryKey = `GET ${path}`;

    return this.coordinator.refresh<V4YearWithShowsResource>({
      queryKey,
      path,
      force,
      hasLocalData: () => hasV4Year(this.realm, artistUuid, yearUuid, this.resultIds(queryKey)),
      apply: (resource) => {
        assertExpectedResourceId(path, yearId, resource.id);
        assertExpectedResourceId(path, artistId, resource.artist_id);
        return applyV4Year(this.realm, artistUuid, yearUuid, resource);
      },
    });
  }

  refreshShow(showUuid: string, force = false): Promise<void> {
    const showId = encodeV4UuidCatalogId(showUuid, 'show');
    const path = `/shows/${showId}`;

    return this.coordinator.refresh<V4ShowResource>({
      queryKey: `GET ${path}`,
      path,
      force,
      hasLocalData: () => hasV4Show(this.realm, showUuid),
      apply: (resource) => {
        assertExpectedResourceId(path, showId, resource.id);
        return applyV4FullShow(this.realm, resource);
      },
    });
  }

  refreshSource(sourceUuid: string, force = false): Promise<void> {
    const sourceId = encodeV4UuidCatalogId(sourceUuid, 'source');
    const path = `/sources/${sourceId}`;

    return this.coordinator.refresh<V4SourceResource>({
      queryKey: `GET ${path}`,
      path,
      force,
      hasLocalData: () => hasV4Source(this.realm, sourceUuid),
      apply: (resource) => {
        assertExpectedResourceId(path, sourceId, resource.id);
        return applyV4FullSource(this.realm, resource);
      },
    });
  }

  refreshTrack(trackUuid: string, force = false): Promise<void> {
    const trackId = encodeV4UuidCatalogId(trackUuid, 'track');
    const path = `/source-tracks/${trackId}`;

    return this.coordinator.refresh<V4TrackResource>({
      queryKey: `GET ${path}`,
      path,
      force,
      hasLocalData: () => hasV4Track(this.realm, trackUuid),
      apply: (resource) => {
        assertExpectedResourceId(path, trackId, resource.id);
        return applyV4Track(this.realm, resource);
      },
    });
  }

  onNetworkAvailable() {
    return this.coordinator.onNetworkAvailable();
  }

  private hasArtistList() {
    const state = this.realm.objectForPrimaryKey(CatalogQueryState, ARTIST_LIST_QUERY_KEY);
    return (
      state?.hasAppliedData === true &&
      state.resultIds.every((artistUuid) => this.hasArtist(artistUuid))
    );
  }

  private hasArtist(artistUuid: string) {
    const artist = this.realm.objectForPrimaryKey<Artist>('Artist', artistUuid);
    return artist !== null && artist.deletedAt == null;
  }

  private async ensureArtist(artistUuid: string) {
    if (this.hasArtist(artistUuid)) return;

    // Direct artist-owned reads can race the artist bootstrap. Coalesce with
    // that request first, then force only if a fresh list still lacks this artist.
    await this.refreshArtists(false);
    if (!this.hasArtist(artistUuid)) {
      await this.refreshArtists(true);
    }
  }

  private resultIds(queryKey: string) {
    return this.realm.objectForPrimaryKey(CatalogQueryState, queryKey)?.resultIds ?? [];
  }
}
