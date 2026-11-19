import plur from 'plur';
import { UserFavorite } from '@/relisten/realm/models/library';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { useQuery } from '@/relisten/realm/schema';

/**
 * What the deletion warning lists: the playlists the account made and its
 * favorites, as this device knows them. Playlists in Recently Deleted and
 * followed playlists aren't counted.
 */
export function useAccountDataCounts(userId: string | null) {
  const libraryUserId = userId ?? '';
  const playlists = useQuery(
    Playlist,
    (rows) =>
      rows.filtered(
        'libraryUserId == $0 AND access == $1 AND deletedAt == null AND archived == false',
        libraryUserId,
        'owner'
      ),
    [libraryUserId]
  ).length;
  const favorites = useQuery(
    UserFavorite,
    (rows) => rows.filtered('scopeId == $0 AND effectivePresent == true', libraryUserId),
    [libraryUserId]
  ).length;

  return {
    playlists,
    favorites,
    summary: `${countLabel(playlists, 'playlist')} and ${countLabel(favorites, 'favorite')}`,
  };
}

function countLabel(count: number, noun: string) {
  return `${count} ${plur(noun, count)}`;
}
