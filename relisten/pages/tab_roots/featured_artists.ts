import { displayedPlays, popularSortValue } from '@/relisten/realm/models/popularity';
interface BrowseArtist {
  uuid: string;
  isFavorite: boolean;
  isAutomaticallyCreated(): boolean;
  isFeatured(): boolean;
  popularity?: Parameters<typeof displayedPlays>[0];
}

const POPULAR_ARTIST_LIMIT = 50;

export function selectFeaturedArtists<T extends BrowseArtist>(
  artists: ReadonlyArray<T>,
  isFavorite: (artist: T) => boolean = (artist) => artist.isFavorite
): T[] {
  const candidates = artists.filter(
    (artist) => !isFavorite(artist) && !artist.isAutomaticallyCreated()
  );
  // The most-played artists by the plays their rows show (the past year's).
  const hasPopularity = candidates.some(
    (artist) => displayedPlays(artist.popularity) !== undefined
  );
  const popular = hasPopularity
    ? [...candidates]
        .sort((a, b) => popularSortValue(b.popularity) - popularSortValue(a.popularity))
        .slice(0, POPULAR_ARTIST_LIMIT)
    : candidates;

  const selected = new Map(popular.map((artist) => [artist.uuid, artist]));
  for (const artist of artists) {
    if (!isFavorite(artist) && artist.isFeatured()) {
      selected.set(artist.uuid, artist);
    }
  }

  return [...selected.values()];
}
