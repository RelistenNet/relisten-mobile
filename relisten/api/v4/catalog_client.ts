import Realm from 'realm';

import type { AccountScopeSource } from '@/relisten/accounts/account_scope_store';
import { encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import {
  CatalogV4Coordinator,
  type CatalogV4RefreshResult,
} from '@/relisten/api/v4/catalog_coordinator';
import {
  CatalogV4ProtocolError,
  CatalogV4Transport,
  type CatalogV4TransportOptions,
} from '@/relisten/api/v4/catalog_transport';
import type {
  V4ArtistCatalogResource,
  V4ArtistResource,
  V4ShowResource,
  V4SourceResource,
  V4TrackResource,
} from '@/relisten/api/v4/wire_types';
import { Artist } from '@/relisten/realm/models/artist';
import { CatalogQueryState } from '@/relisten/realm/models/v4_catalog';
import {
  applyV4ArtistCatalog,
  applyV4ArtistList,
  applyV4FullShow,
  applyV4FullSource,
  applyV4Track,
  hasV4ArtistCatalog,
  hasV4Show,
  hasV4Source,
  hasV4Track,
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

export interface CatalogV4ClientOptions {
  accountScope?: AccountScopeSource;
  transport?: CatalogV4Transport;
  transportOptions?: CatalogV4TransportOptions;
}

/** Explicit mobile coverage for the five C3 endpoint ownership policies. */
export class CatalogV4Client {
  private readonly coordinator: CatalogV4Coordinator;

  constructor(
    private readonly realm: Realm,
    options: CatalogV4ClientOptions = {}
  ) {
    this.coordinator = new CatalogV4Coordinator(
      realm,
      options.transport ?? new CatalogV4Transport(options.transportOptions),
      { accountScope: options.accountScope }
    );
  }

  refreshArtists(force = false): Promise<CatalogV4RefreshResult> {
    return this.coordinator.refresh<V4ArtistResource[]>({
      queryKey: ARTIST_LIST_QUERY_KEY,
      path: ARTIST_LIST_PATH,
      force,
      hasLocalData: () => this.hasArtistList(),
      apply: (resources) => applyV4ArtistList(this.realm, resources),
      retry: () => this.refreshArtists(false),
    });
  }

  refreshArtistCatalog(artistUuid: string, force = false): Promise<CatalogV4RefreshResult> {
    const artistId = encodeV4UuidCatalogId(artistUuid, 'artist');
    const path = `/artists/${artistId}/catalog`;

    return this.coordinator.refresh<V4ArtistCatalogResource>({
      queryKey: `GET ${path}`,
      path,
      force,
      hasLocalData: () => hasV4ArtistCatalog(this.realm, artistUuid),
      apply: (resource) => {
        assertExpectedResourceId(path, artistId, resource.artist?.id);
        return applyV4ArtistCatalog(this.realm, resource);
      },
      retry: () => this.refreshArtistCatalog(artistUuid, false),
    });
  }

  refreshShow(showUuid: string, force = false): Promise<CatalogV4RefreshResult> {
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
      retry: () => this.refreshShow(showUuid, false),
    });
  }

  refreshSource(sourceUuid: string, force = false): Promise<CatalogV4RefreshResult> {
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
      retry: () => this.refreshSource(sourceUuid, false),
    });
  }

  refreshTrack(trackUuid: string, force = false): Promise<CatalogV4RefreshResult> {
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
      retry: () => this.refreshTrack(trackUuid, false),
    });
  }

  onNetworkAvailable() {
    return this.coordinator.onNetworkAvailable();
  }

  replaceTransport(transport: CatalogV4Transport) {
    this.coordinator.replaceTransport(transport);
  }

  private hasArtistList() {
    const state = this.realm.objectForPrimaryKey(CatalogQueryState, ARTIST_LIST_QUERY_KEY);
    return (
      state?.hasAppliedData === true &&
      state.resultIds.every((artistUuid) => this.realm.objectForPrimaryKey(Artist, artistUuid))
    );
  }
}

export type { CatalogV4RefreshResult };
