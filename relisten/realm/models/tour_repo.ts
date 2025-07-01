import { Repository } from '../repository';
import { useRealm } from '../schema';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { useArtist } from './artist_repo';
import { mergeNetworkBackedResults } from '../network_backed_results';
import { useMemo } from 'react';
import { Tour } from './tour';
import { NetworkBackedBehaviorOptions } from '@/relisten/realm/network_backed_behavior';
import { NetworkBackedModelArrayBehavior } from '@/relisten/realm/network_backed_model_array_behavior';

export const tourRepo = new Repository(Tour);

export function useTours(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();

  const behavior = useMemo(() => {
    return new NetworkBackedModelArrayBehavior(
      realm,
      tourRepo,
      (realm) => realm.objects(Tour).filtered('artistUuid == $0', artistUuid),
      (api) => api.tours(artistUuid),
      options
    );
  }, [realm, artistUuid, options]);

  return useNetworkBackedBehavior(behavior);
}

export const useArtistTours = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid);
  const toursResults = useTours(artistUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      tours: toursResults,
      artist: artistResults,
    });
  }, [toursResults, artistResults]);

  return results;
};
