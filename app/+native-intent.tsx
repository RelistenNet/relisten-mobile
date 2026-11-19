import { sharedPlaylistRoute } from '@/relisten/playlists/sharing/shared_playlist_link';

const AUTH_CALLBACK_PATH = /\/auth\/mobile\/(ios|android)\/callback(?:[/?#]|$)/;

/**
 * Android returns from sign-in through a relisten.net callback link. While the
 * app is running, the auth session waiting in expo-web-browser receives that
 * link and finishes sign-in itself. Routing it as well would swap the whole app
 * for the callback screen (the root is a Slot), so the tabs would remount and
 * lose the screen sign-in started from. A cold start from the link still routes
 * to the callback screen, which finishes the pending sign-in.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (!initial && AUTH_CALLBACK_PATH.test(path)) {
    return null;
  }

  // A shared playlist link opens the playlist inside the tabs. Unhandled, it
  // would fall through to the web routes, which read "playlists" as an artist.
  return sharedPlaylistRoute(path) ?? path;
}
