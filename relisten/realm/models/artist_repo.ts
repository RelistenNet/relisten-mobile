import {
  NetworkBackedBehaviorFetchStrategy,
  NetworkBackedBehaviorOptions,
} from '@/relisten/realm/network_backed_behavior';
import { useMemo } from 'react';
import { createNetworkBackedModelArrayHook } from '../network_backed_behavior_hooks';
import { NetworkBackedResults } from '../network_backed_results';
import { Repository } from '../repository';
import { useQuery } from '../schema';
import { Artist } from './artist';

import { useIsDownloadedTab } from '@/relisten/util/routes';
import { useRealmTabsFilter } from '../realm_filters';
import { Show } from './show';
import { Source } from './source';

export const artistRepo = new Repository(Artist);
export const useArtists = createNetworkBackedModelArrayHook(
  artistRepo,
  () => useRealmTabsFilter(useQuery(Artist)),
  (api) => api.artists()
);

export function useArtistMetadata(artist?: Artist | null) {
  const isDownloadedTab = useIsDownloadedTab();
  const sh = useRealmTabsFilter(
    useQuery(Show, (query) => query.filtered('artistUuid = $0', artist?.uuid), [artist?.uuid])
  );
  const src = useRealmTabsFilter(
    useQuery(Source, (query) => query.filtered('artistUuid = $0', artist?.uuid), [artist?.uuid])
  );

  if (!artist) {
    return { shows: undefined, sources: undefined };
  }

  if (isDownloadedTab) {
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

  const artists = useArtists(memoOptions);

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
