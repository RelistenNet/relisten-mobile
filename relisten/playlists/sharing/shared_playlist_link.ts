import { isPublicCode } from './sharing_wire';

const SHARED_PLAYLIST_PATH = /^\/playlists\/([^/?#]+)\/?(?:[?#].*)?$/;

/**
 * Where a `relisten.net/playlists/<code>` link opens in the app, or null for
 * any other link. The system hands over either the full URL or just its path.
 */
export function sharedPlaylistRoute(link: string): string | null {
  const path = pathOf(link);
  const code = path?.match(SHARED_PLAYLIST_PATH)?.[1]?.toLowerCase();
  return code && isPublicCode(code) ? `/relisten/tabs/(myLibrary)/playlists/shared/${code}` : null;
}

function pathOf(link: string): string | null {
  if (link.startsWith('/')) {
    return link;
  }
  try {
    const url = new URL(link);
    return url.hostname === 'relisten.net' || url.hostname === 'www.relisten.net'
      ? url.pathname
      : null;
  } catch {
    return null;
  }
}
