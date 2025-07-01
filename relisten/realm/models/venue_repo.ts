import { Repository } from '../repository';
import { useRealm } from '../schema';
import { useNetworkBackedBehavior } from '../network_backed_behavior_hooks';
import { useArtist } from './artist_repo';
import { mergeNetworkBackedResults } from '../network_backed_results';
import { useMemo } from 'react';
import { Venue } from './venue';
import { NetworkBackedBehaviorOptions } from '@/relisten/realm/network_backed_behavior';
import { NetworkBackedModelArrayBehavior } from '@/relisten/realm/network_backed_model_array_behavior';

export const venueRepo = new Repository(Venue);

export function useVenues(artistUuid: string, options?: NetworkBackedBehaviorOptions) {
  const realm = useRealm();

  const behavior = useMemo(() => {
    return new NetworkBackedModelArrayBehavior(
      realm,
      venueRepo,
      (realm) => realm.objects(Venue).filtered('artistUuid == $0 && showsAtVenue > 0', artistUuid),
      (api) => api.venues(artistUuid),
      options
    );
  }, [realm, artistUuid, options]);

  return useNetworkBackedBehavior(behavior);
}

export const useArtistVenues = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid);
  const venuesResults = useVenues(artistUuid);

  const results = useMemo(() => {
    return mergeNetworkBackedResults({
      venues: venuesResults,
      artist: artistResults,
    });
  }, [venuesResults, artistResults]);

  return results;
};
