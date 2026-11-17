import type { useRouter } from 'expo-router';
import type { RelistenTabGroupSegment } from '@/relisten/util/routes';

type Router = ReturnType<typeof useRouter>;

/**
 * Opens the add-to-playlist sheet. With `linkable`, tracks from one show can be
 * linked where they play back to back; the sheet offers that as a switch.
 */
export function openAddToPlaylist(
  router: Router,
  trackIds: string[],
  options: { linkable: boolean }
) {
  router.push({
    pathname: '/relisten/add-to-playlist',
    params: { tracks: trackIds.join(','), linkable: options.linkable ? '1' : '0' },
  });
}

/** Opens the same sheet with nothing to add, which goes straight to naming a new playlist. */
export function openNewPlaylist(router: Router) {
  router.push({ pathname: '/relisten/add-to-playlist', params: { tracks: '', linkable: '0' } });
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
