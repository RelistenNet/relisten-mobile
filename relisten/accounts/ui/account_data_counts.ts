import { UserFavorite } from '@/relisten/realm/models/library';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { useQuery } from '@/relisten/realm/schema';

/**
 * What the deletion warning lists: the account's playlists and favorites as
 * this device knows them. Playlists in Recently Deleted aren't counted.
 */
export function useAccountDataCounts(userId: string | null) {
  const owner = userId ?? '';
  const playlists = useQuery(
    Playlist,
    (rows) => rows.filtered('ownerUserId == $0 AND deletedAt == null AND archived == false', owner),
    [owner]
  ).length;
  const favorites = useQuery(
    UserFavorite,
    (rows) => rows.filtered('scopeId == $0 AND effectivePresent == true', owner),
    [owner]
  ).length;

  return {
    playlists,
    favorites,
    summary: `${countLabel(playlists, 'playlist')} and ${countLabel(favorites, 'favorite')}`,
  };
}

function countLabel(count: number, noun: string) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}
