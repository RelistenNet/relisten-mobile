import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useMemo } from 'react';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { NetworkBackedResults } from '../network_backed_results';
import { Repository } from '../repository';
import { useQuery, useRealm } from '../schema';
import { Artist, ArtistFeaturedFlags } from './artist';

import { useIsOfflineTab } from '@/relisten/util/routes';
import { filterForUser, useRealmTabsFilter } from '../realm_filters';
import { Show } from './show';
import { Source } from './source';
import { NetworkBackedModelArrayBehavior } from '@/relisten/realm/network_backed_model_array_behavior';

export const artistRepo = new Repository(Artist);

export function artistsNetworkBackedBehavior(
  realm: Realm.Realm,
  availableOfflineOnly: boolean,
  includeAutomaticallyCreated: boolean,
  options?: NetworkBackedBehaviorOptions
) {
  return new NetworkBackedModelArrayBehavior(
    realm,
    artistRepo,
    (realm) => {
      let q = filterForUser(realm.objects<Artist>(Artist), {
        isFavorite: null,
        isPlayableOffline: availableOfflineOnly ? availableOfflineOnly : null,
      });

      if (!includeAutomaticallyCreated) {
        q = q.filtered(`featured != ${ArtistFeaturedFlags.AutoCreated}`);
      }

      return q;
    },
    (api, forcedRefresh) =>
      api.artists(includeAutomaticallyCreated, api.refreshOptions(forcedRefresh)),
    options
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

export function useArtistMetadata(artist?: Artist | null) {
  const isOfflineTab = useIsOfflineTab();
  const sh = useRealmTabsFilter(
    useQuery(Show, (query) => query.filtered('artistUuid = $0', artist?.uuid), [artist?.uuid])
  );
  const src = useRealmTabsFilter(
    useQuery(Source, (query) => query.filtered('artistUuid = $0', artist?.uuid), [artist?.uuid])
  );

  if (!artist) {
    return { shows: undefined, sources: undefined };
  }

  if (isOfflineTab) {
    return { shows: sh.length, sources: src.length };
  }

  return { shows: artist.showCount, sources: artist.sourceCount };
}

export function useArtist(
  artistUuid?: string,
  options?: NetworkBackedBehaviorOptions
): NetworkBackedResults<Artist | null> {
  // memoize to prevent trying a new request each time the options "change"
  const memoOptions = useMemo(() => {
    return {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable,
      ...options,
    };
  }, [options]);

  const artists = useAllArtists(memoOptions);

  const artistQuery = useMemo(() => {
    return artists.data.filtered('uuid == $0', artistUuid);
  }, [artists.data, artistUuid]);

  const artist = useMemo(() => {
    if (artistQuery.length > 0) {
      return artistQuery[0];
    }

    return null;
  }, [artistQuery]);

  return { ...artists, data: artist };
}

export function useArtistBySlug(
  artistSlug?: string,
  options?: NetworkBackedBehaviorOptions
): NetworkBackedResults<Artist | null> {
  // memoize to prevent trying a new request each time the options "change"
  const memoOptions = useMemo(() => {
    return {
      fetchStrategy: NetworkBackedBehaviorFetchStrategy.NetworkOnlyIfLocalIsNotShowable,
      ...options,
    };
  }, [options]);

  const artists = useAllArtists(memoOptions);

  const artistQuery = useMemo(() => {
    return artists.data.filtered('slug == $0', artistSlug);
  }, [artists.data, artistSlug]);

  const artist = useMemo(() => {
    if (artistQuery.length > 0) {
      return artistQuery[0];
    }

    return null;
  }, [artistQuery]);

  return { ...artists, data: artist };
}
