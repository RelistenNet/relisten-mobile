import type { PopularityResource } from '@/relisten/api/catalog/resources';

export interface PlaylistAudience {
  follower_count?: number | null;
  popularity?: PopularityResource | null;
  popularity_as_of?: string | null;
}

export function playlistAudienceLabel(audience?: PlaylistAudience | null) {
  const followers = audience?.follower_count;
  const plays = audience?.popularity?.windows['30d'].plays;
  return [
    followers == null
      ? null
      : `${followers.toLocaleString()} ${followers === 1 ? 'follower' : 'followers'}`,
    plays == null
      ? null
      : `${plays.toLocaleString()} ${plays === 1 ? 'track play' : 'track plays'} in 30 days`,
  ]
    .filter(Boolean)
    .join(' · ');
}
