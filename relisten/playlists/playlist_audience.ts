import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import type { PopularityResource } from '@/relisten/api/catalog/resources';

export interface PlaylistAudience {
  follower_count?: number | null;
  popularity?: PopularityResource | null;
  popularity_as_of?: string | null;
}

export function hasPublicPlaylistAudience(
  playlist: Pick<Playlist, 'access' | 'published' | 'takenDown' | 'unavailable' | 'archived'>
): boolean {
  return (
    !playlist.unavailable &&
    (playlist.access === 'follower' ||
      (playlist.published && !playlist.takenDown && !playlist.archived))
  );
}

/** Followers and 30-day plays, each as a short phrase; missing counts are left out. */
export function playlistAudienceParts(audience?: PlaylistAudience | null): string[] {
  const followers = audience?.follower_count;
  const plays = audience?.popularity?.windows['30d'].plays;
  const parts: string[] = [];

  if (followers != null) {
    parts.push(`${followers.toLocaleString()} ${followers === 1 ? 'follower' : 'followers'}`);
  }
  if (plays != null) {
    parts.push(
      `${plays.toLocaleString()} ${plays === 1 ? 'track play' : 'track plays'} in 30 days`
    );
  }

  return parts;
}

export function playlistAudienceLabel(audience?: PlaylistAudience | null) {
  return playlistAudienceParts(audience).join(' · ');
}
