import Realm from 'realm';
import { RelistenApiClient } from '@/relisten/api/client';
import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useMemo } from 'react';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { NetworkBackedResults } from '../network_backed_results';
import { Repository } from '../repository';
import { useQuery, useRealm } from '../schema';
import { Artist, ArtistFeaturedFlags, ArtistRequiredProperties } from './artist';
import { ArtistWithCounts } from '@/relisten/api/models/artist';

import { useGroupSegment, useIsOfflineTab } from '@/relisten/util/routes';
import { filterForUser, useRealmTabsFilter } from '../realm_filters';
import { Show } from './show';
import { Source } from './source';
import { NetworkBackedModelArrayBehavior } from '@/relisten/realm/network_backed_model_array_behavior';
import { RealmQueryValueStream, ValueStream } from '@/relisten/realm/value_streams';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';
import { attachArtistsToExistingShows } from '@/relisten/realm/models/show_artist_relationships';
import { useFavoriteCatalogUuids } from '@/relisten/realm/root_services';

export const artistRepo = new Repository(Artist);

class ArtistsNetworkBackedBehavior extends NetworkBackedModelArrayBehavior<
  Artist,
  ArtistWithCounts,
  ArtistRequiredProperties,
  object
> {
  constructor(
    realm: Realm.Realm,
    private readonly responseIncludesAutomaticallyCreated: boolean,
    fetchFromRealm: (realm: Realm.Realm) => Realm.Results<Artist>,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(
      realm,
      artistRepo,
      fetchFromRealm,
      (api, forcedRefresh) =>
        api.artists(responseIncludesAutomaticallyCreated, api.refreshOptions(forcedRefresh)),
      options
    );
  }

  override upsert(localData: Realm.Results<Artist>, apiData: ArtistWithCounts[]): void {
    this.realm.write(() => {
      // The filtered artists endpoint intentionally omits auto-created artists. Do not treat that
      // omission as a catalog deletion; the endpoint is authoritative only for its visible slice.
      const authoritativeLocalData = this.responseIncludesAutomaticallyCreated
        ? localData
        : localData.filtered(`featured != ${ArtistFeaturedFlags.AutoCreated}`);
      const { allModels } = artistRepo.upsertMultiple(
        this.realm,
        apiData,
        authoritativeLocalData,
        true,
        true
      );

      attachArtistsToExistingShows(this.realm, allModels);
    });
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
  includeAutomaticallyCreated: boolean,
  includeDeleted: boolean,
  automaticallyCreatedVisibility: AutomaticallyCreatedArtistVisibility,
  options?: NetworkBackedBehaviorOptions
) {
  return new ArtistsNetworkBackedBehavior(
    realm,
    includeAutomaticallyCreated,
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
      false,
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
    return artistsNetworkBackedBehavior(realm, false, true, false, 'all', options);
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

class ArtistBootstrapNetworkBackedBehavior extends ThrottledNetworkBackedBehavior<
  Artist | null,
  ArtistWithCounts[]
> {
  constructor(
    realm: Realm.Realm,
    private readonly localQueryFactory: (realm: Realm.Realm) => Realm.Results<Artist>,
    options?: NetworkBackedBehaviorOptions
  ) {
    super(realm, {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable,
      ...options,
    });
  }

  override fetchFromApi(api: RelistenApiClient, forcedRefresh: boolean) {
    return api.artists(true, api.refreshOptions(forcedRefresh));
  }

  override createLocalUpdatingResults(): ValueStream<Artist | null> {
    return new SingleArtistValueStream(this.realm, this.localQueryFactory(this.realm));
  }

  override isLocalDataShowable(localData: Artist | null): boolean {
    return localData !== null;
  }

  override upsert(_localData: Artist | null, apiData: ArtistWithCounts[]): void {
    if (apiData.length === 0) {
      return;
    }

    this.realm.write(() => {
      const { allModels } = artistRepo.upsertMultiple(this.realm, apiData, [], false, true);

      attachArtistsToExistingShows(this.realm, allModels);
    });
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
