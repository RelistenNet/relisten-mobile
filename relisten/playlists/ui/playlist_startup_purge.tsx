import { useEffect } from 'react';
import { useRealm } from '@/relisten/realm/schema';
import { purgeExpiredPlaylists } from '@/relisten/playlists/playlist_repository';
import { refreshStaleGuideMarkdown } from '@/relisten/playlists/guide/guide_rows';

/**
 * Startup upkeep for playlists: permanently removes those in Recently Deleted
 * for more than 30 days, and re-sanitizes guide text stored by an older
 * sanitizer (see `GUIDE_MARKDOWN_VERSION`).
 */
export function PlaylistStartupPurge() {
  const realm = useRealm();
  useEffect(() => {
    purgeExpiredPlaylists(realm);
    refreshStaleGuideMarkdown(realm);
  }, [realm]);
  return null;
}
