import { Repository } from '../repository';
import { useArtist } from './artist_repo';
import { Venue } from './venue';

export const venueRepo = new Repository(Venue);

export const useArtistVenues = (artistUuid: string) => {
  const artistResults = useArtist(artistUuid, { onlyFetchFromApiIfLocalIsNotShowable: true });

  return { data: [] };
};
