interface BrowseArtist {
  uuid: string;
  isFavorite: boolean;
  isAutomaticallyCreated(): boolean;
  isFeatured(): boolean;
  popularity?: { windows?: { days30d?: { plays?: number } } };
}

const POPULAR_ARTIST_LIMIT = 50;

export function selectFeaturedArtists<T extends BrowseArtist>(artists: ReadonlyArray<T>): T[] {
  const candidates = artists.filter(
    (artist) => !artist.isFavorite && !artist.isAutomaticallyCreated()
  );
  const hasPopularity = candidates.some(
    (artist) => artist.popularity?.windows?.days30d?.plays !== undefined
  );
  const popular = hasPopularity
    ? [...candidates]
        .sort(
          (a, b) =>
            (b.popularity?.windows?.days30d?.plays ?? 0) -
            (a.popularity?.windows?.days30d?.plays ?? 0)
        )
        .slice(0, POPULAR_ARTIST_LIMIT)
    : candidates;

  const selected = new Map(popular.map((artist) => [artist.uuid, artist]));
  for (const artist of artists) {
    if (!artist.isFavorite && artist.isFeatured()) {
      selected.set(artist.uuid, artist);
    }
  }

  return [...selected.values()];
}
