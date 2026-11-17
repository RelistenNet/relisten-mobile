import { useEffect } from 'react';
import { useRealm } from '@/relisten/realm/schema';
import { purgeExpiredPlaylists } from '@/relisten/playlists/playlist_repository';

/** Permanently removes playlists that have been in Recently Deleted for more than 30 days. */
export function PlaylistStartupPurge() {
  const realm = useRealm();
  useEffect(() => purgeExpiredPlaylists(realm), [realm]);
  return null;
}
