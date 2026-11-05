import { RelistenApiClient } from '@/relisten/api/client';
import type { V4ArtistResource } from '@/relisten/api/v4/wire_types';
import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { applyV4ArtistList } from '@/relisten/realm/v4_catalog_apply';
import { useMemo } from 'react';
import Realm from 'realm';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { NetworkBackedResults } from '../network_backed_results';
import { useQuery, useRealm } from '../schema';
import { Artist, ArtistFeaturedFlags } from './artist';
import { CatalogQueryState } from './v4_catalog';

import { NetworkBackedBehavior } from '@/relisten/realm/network_backed_behavior';
import { useFavoriteCatalogUuids } from '@/relisten/realm/root_services';
import { RealmQueryValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { useGroupSegment, useIsOfflineTab } from '@/relisten/util/routes';
import { filterForUser, useRealmTabsFilter } from '../realm_filters';
import { Show } from './show';
import { Source } from './source';

export class ArtistsNetworkBackedBehavior extends NetworkBackedBehavior<
  Realm.Results<Artist>,
  V4ArtistResource[]
> {
  get queryKey() {
    return 'GET /artists?include_autocreated=true';
  }

  constructor(
    realm: Realm,
    private readonly localQuery: (realm: Realm) => Realm.Results<Artist>,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, options);
  }

  createLocalUpdatingResults() {
    return new RealmQueryValueStream(this.realm, this.localQuery(this.realm));
  }

  fetchFromApi(api: RelistenApiClient, _force: boolean, etag?: string) {
    return api.artists({ etag });
  }

  isLocalDataShowable(data: Realm.Results<Artist>) {
    return (
      data.length > 0 ||
      this.realm.objectForPrimaryKey(CatalogQueryState, this.queryKey)?.hasAppliedData === true
    );
  }

  upsert(_data: Realm.Results<Artist>, resources: V4ArtistResource[]) {
    return applyV4ArtistList(this.realm, resources);
  }
}

/** Child repositories bootstrap only when their required artist is absent. */
export async function ensureCatalogArtist(
  realm: Realm,
  api: RelistenApiClient,
  artistUuid?: string
) {
  const artist = artistUuid ? realm.objectForPrimaryKey(Artist, artistUuid) : null;
  if (artist && artist.deletedAt == null) {
    return;
  }
  const behavior = new ArtistsNetworkBackedBehavior(realm, (r) => r.objects(Artist));
  const executor = behavior.sharedExecutor(api);
  await executor.refresh(artistUuid !== undefined);
  const errors = executor.currentResults().errors;
  executor.tearDown();
  if (errors?.length) {
    throw errors[0].error ?? new Error(errors[0].message);
  }
}

type AutomaticallyCreatedArtistVisibility = ReadonlySet<string> | 'all';

export interface ArtistMetadataSummary {
  shows: number | undefined;
  sources: number | undefined;
}

export function artistsNetworkBackedBehavior(
  realm: Realm.Realm,
  availableOfflineOnly: boolean,
  includeDeleted: boolean,
  automaticallyCreatedVisibility: AutomaticallyCreatedArtistVisibility,
  options?: NetworkBackedBehaviorOptions
) {
  return new ArtistsNetworkBackedBehavior(
    realm,
    (realm) => {
      let catalogArtists = realm.objects<Artist>(Artist);
      if (!includeDeleted) {
        catalogArtists = catalogArtists.filtered('deletedAt == nil');
      }

      let q = filterForUser(catalogArtists, {
        isPlayableOffline: availableOfflineOnly ? availableOfflineOnly : null,
      });

      if (automaticallyCreatedVisibility !== 'all') {
        q = q.filtered(`featured != ${ArtistFeaturedFlags.AutoCreated} OR uuid IN $0`, [
          ...automaticallyCreatedVisibility,
        ]);
      }

      return q;
    },
    options
  );
}

export function useArtists(options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const isOfflineTab = useIsOfflineTab();
  const includeDeleted = useGroupSegment() !== '(artists)';
  const favoriteArtistUuids = useFavoriteCatalogUuids('artist');

  const behavior = useMemo(() => {
    return artistsNetworkBackedBehavior(
      realm,
      isOfflineTab,
      includeDeleted,
      favoriteArtistUuids,
      options
    );
  }, [realm, options, isOfflineTab, includeDeleted, favoriteArtistUuids]);

  return useNetworkBackedBehavior(behavior);
}

export function useAllArtists(options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();

  const behavior = useMemo(() => {
    return artistsNetworkBackedBehavior(realm, false, false, 'all', options);
  }, [realm, options]);

  return useNetworkBackedBehavior(behavior);
}

class SingleArtistValueStream extends ValueStream<Artist | null> {
  public currentValue: Artist | null;

  private readonly resultsStream: RealmQueryValueStream<Artist>;

  private readonly tearDownResultsListener: () => void;

  constructor(realm: Realm.Realm, query: Realm.Results<Artist>) {
    super();

    this.resultsStream = new RealmQueryValueStream(realm, query);
    this.currentValue = this.resolveCurrentArtist(this.resultsStream.currentValue);
    this.tearDownResultsListener = this.resultsStream.addListener((nextResults) => {
      this.currentValue = this.resolveCurrentArtist(nextResults);
      this.emitCurrentValue();
    });
  }

  override tearDown() {
    super.tearDown();
    this.tearDownResultsListener();
    this.resultsStream.tearDown();
  }

  private resolveCurrentArtist(results: Realm.Results<Artist>) {
    return results[0] ?? null;
  }
}

class ArtistBootstrapNetworkBackedBehavior extends NetworkBackedBehavior<
  Artist | null,
  V4ArtistResource[]
> {
  get queryKey() {
    return 'GET /artists?include_autocreated=true';
  }

  constructor(
    realm: Realm,
    private readonly localQueryFactory: (realm: Realm) => Realm.Results<Artist>,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable,
      ...options,
    });
  }

  fetchFromApi(api: RelistenApiClient, _force: boolean, etag?: string) {
    return api.artists({ etag });
  }

  createLocalUpdatingResults(): ValueStream<Artist | null> {
    return new SingleArtistValueStream(this.realm, this.localQueryFactory(this.realm));
  }

  isLocalDataShowable(data: Artist | null) {
    return data !== null;
  }

  hasLocalData() {
    return this.localQueryFactory(this.realm).length > 0;
  }

  upsert(_data: Artist | null, resources: V4ArtistResource[]) {
    return applyV4ArtistList(this.realm, resources);
  }
}

export function useOfflineArtistMetadata(artist?: Artist | null): ArtistMetadataSummary {
  const shows = useRealmTabsFilter(
    useQuery(Show, (query) => query.filtered('artistUuid = $0', artist?.uuid), [artist?.uuid])
  );
  const sources = useRealmTabsFilter(
    useQuery(Source, (query) => query.filtered('artistUuid = $0', artist?.uuid), [artist?.uuid])
  );

  if (!artist) {
    return { shows: undefined, sources: undefined };
  }

  return { shows: shows.length, sources: sources.length };
}

export function useOfflineArtistMetadataMap(
  artists: ReadonlyArray<Artist>
): ReadonlyMap<string, ArtistMetadataSummary> {
  const shows = useRealmTabsFilter(useQuery(Show));
  const sources = useRealmTabsFilter(useQuery(Source));

  return useMemo(() => {
    const metadataMap = new Map<string, ArtistMetadataSummary>();

    for (const artist of artists) {
      metadataMap.set(artist.uuid, { shows: 0, sources: 0 });
    }

    for (const show of shows) {
      const existing = metadataMap.get(show.artistUuid);
      if (existing) {
        existing.shows = (existing.shows ?? 0) + 1;
      }
    }

    for (const source of sources) {
      const existing = metadataMap.get(source.artistUuid);
      if (existing) {
        existing.sources = (existing.sources ?? 0) + 1;
      }
    }

    return metadataMap;
  }, [artists, shows, sources]);
}

export function useArtist(
  artistUuid?: string,
  options?: NetworkBackedBehaviorOptions
): NetworkBackedResults<Artist | null> {
  const memoOptions = useMemo(() => {
    return {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable,
      ...options,
    };
  }, [options]);
  const realm = useRealm();
  const includeDeleted = useGroupSegment() !== '(artists)';
  const behavior = useMemo(() => {
    return new ArtistBootstrapNetworkBackedBehavior(
      realm,
      (currentRealm) =>
        currentRealm
          .objects(Artist)
          .filtered(
            includeDeleted ? 'uuid == $0' : 'uuid == $0 && deletedAt == nil',
            artistUuid ?? '__missing__'
          ),
      memoOptions
    );
  }, [artistUuid, includeDeleted, memoOptions, realm]);

  return useNetworkBackedBehavior(behavior);
}

export function useArtistBySlug(
  artistSlug?: string,
  options?: NetworkBackedBehaviorOptions
): NetworkBackedResults<Artist | null> {
  const memoOptions = useMemo(() => {
    return {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable,
      ...options,
    };
  }, [options]);
  const realm = useRealm();
  const includeDeleted = useGroupSegment() !== '(artists)';
  const behavior = useMemo(() => {
    return new ArtistBootstrapNetworkBackedBehavior(
      realm,
      (currentRealm) =>
        currentRealm
          .objects(Artist)
          .filtered(
            includeDeleted ? 'slug == $0' : 'slug == $0 && deletedAt == nil',
            artistSlug ?? '__missing__'
          ),
      memoOptions
    );
  }, [artistSlug, includeDeleted, memoOptions, realm]);

  return useNetworkBackedBehavior(behavior);
}
