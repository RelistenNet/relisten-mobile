import type { useRouter } from 'expo-router';
import type { RelistenTabGroupSegment } from '@/relisten/util/routes';

type Router = ReturnType<typeof useRouter>;

/**
 * Opens the add-to-playlist sheet. `together` keeps the tracks as one group;
 * a single track is always added on its own.
 */
export function openAddToPlaylist(
  router: Router,
  trackIds: string[],
  options: { together: boolean }
) {
  router.push({
    pathname: '/relisten/add-to-playlist',
    params: { tracks: trackIds.join(','), together: options.together ? '1' : '0' },
  });
}

/** Opens the same sheet with nothing to add, which goes straight to naming a new playlist. */
export function openNewPlaylist(router: Router) {
  router.push({ pathname: '/relisten/add-to-playlist', params: { tracks: '', together: '0' } });
}

export function openPlaylist(
  router: Router,
  playlistId: string,
  groupSegment: RelistenTabGroupSegment = '(myLibrary)'
) {
  router.push({
    pathname: `/relisten/tabs/${groupSegment}/playlists/[playlistId]`,
    params: { playlistId },
  });
}
