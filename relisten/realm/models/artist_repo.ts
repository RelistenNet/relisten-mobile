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
import {
  ActiveCatalogObjectValueStream,
  RealmQueryValueStream,
  RetainedCatalogObjectValueStream,
  ValueStream,
} from '@/relisten/realm/value_streams';
import { ThrottledNetworkBackedBehavior } from '@/relisten/realm/throttled_network_backed_behavior';
import { attachArtistsToExistingShows } from '@/relisten/realm/models/show_artist_relationships';
import { activeCatalogObjects } from '@/relisten/realm/catalog_retirement';

export const artistRepo = new Repository(Artist);

class ArtistsNetworkBackedBehavior extends NetworkBackedModelArrayBehavior<
  Artist,
  ArtistWithCounts,
  ArtistRequiredProperties,
  object
> {
  override upsert(localData: Realm.Results<Artist>, apiData: ArtistWithCounts[]): void {
    this.realm.write(() => {
      const { allModels } = artistRepo.upsertMultiple(this.realm, apiData, localData);

      attachArtistsToExistingShows(this.realm, allModels);
    });
  }
}

export interface ArtistMetadataSummary {
  shows: number | undefined;
  sources: number | undefined;
}

export function artistsNetworkBackedBehavior(
  realm: Realm.Realm,
  availableOfflineOnly: boolean,
  includeAutomaticallyCreated: boolean,
  options?: NetworkBackedBehaviorOptions
) {
  return new ArtistsNetworkBackedBehavior(
    realm,
    artistRepo,
    (realm) => {
      const catalogArtists = availableOfflineOnly
        ? realm.objects<Artist>(Artist)
        : activeCatalogObjects(realm, Artist);
      let q = filterForUser(catalogArtists, {
        isFavorite: null,
        isPlayableOffline: availableOfflineOnly ? availableOfflineOnly : null,
      });

      if (!includeAutomaticallyCreated) {
        q = q.filtered(`featured != ${ArtistFeaturedFlags.AutoCreated} OR isFavorite == true`);
      }

      return q;
    },
    (api, forcedRefresh) =>
      api.artists(includeAutomaticallyCreated, api.refreshOptions(forcedRefresh)),
    options,
    availableOfflineOnly ? 'offline.artist-list' : undefined
  );
}

export function useArtists(options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();
  const isOfflineTab = useIsOfflineTab();

  const behavior = useMemo(() => {
    return artistsNetworkBackedBehavior(realm, isOfflineTab, false, options);
  }, [realm, options, isOfflineTab]);

  return useNetworkBackedBehavior(behavior);
}

export function useAllArtists(options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();

  const behavior = useMemo(() => {
    return artistsNetworkBackedBehavior(realm, false, true, options);
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
    private readonly localValueStreamFactory: (realm: Realm.Realm) => ValueStream<Artist | null>,
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
    return this.localValueStreamFactory(this.realm);
  }

  override isLocalDataShowable(localData: Artist | null): boolean {
    return localData !== null;
  }

  override upsert(_localData: Artist | null, apiData: ArtistWithCounts[]): void {
    if (apiData.length === 0) {
      return;
    }

    this.realm.write(() => {
      const { allModels } = artistRepo.upsertMultiple(
        this.realm,
        apiData,
        activeCatalogObjects(this.realm, Artist)
      );

      attachArtistsToExistingShows(this.realm, allModels);
    });
  }
}

export function useOfflineArtistMetadata(artist?: Artist | null): ArtistMetadataSummary {
  // Offline metadata intentionally includes retired parents that still own retained downloads.
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
  // Offline metadata intentionally includes retired parents that still own retained downloads.
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
  const groupSegment = useGroupSegment();
  const includeRetiredCatalog = groupSegment !== '(artists)';
  const behavior = useMemo(() => {
    return new ArtistBootstrapNetworkBackedBehavior(
      realm,
      (currentRealm) =>
        includeRetiredCatalog
          ? new RetainedCatalogObjectValueStream(
              currentRealm,
              Artist,
              artistUuid ?? '__missing__',
              'artist-detail.root'
            )
          : new ActiveCatalogObjectValueStream(
              currentRealm,
              Artist,
              artistUuid ?? '__missing__',
              'artist-detail.root'
            ),
      memoOptions
    );
  }, [artistUuid, includeRetiredCatalog, memoOptions, realm]);

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
  const behavior = useMemo(() => {
    return new ArtistBootstrapNetworkBackedBehavior(
      realm,
      (currentRealm) =>
        new SingleArtistValueStream(
          currentRealm,
          activeCatalogObjects(currentRealm, Artist).filtered(
            'slug == $0',
            artistSlug ?? '__missing__'
          )
        ),
      memoOptions
    );
  }, [artistSlug, memoOptions, realm]);

  return useNetworkBackedBehavior(behavior);
}
