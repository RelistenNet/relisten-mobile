import { describe, expect, it, vi } from 'vitest';
import { sharedPlaylistRoute } from './shared_playlist_link';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const code = '0123456789abcdef0123456789abcdef';
const route = `/relisten/tabs/(myLibrary)/playlists/shared/${code}`;

describe('shared playlist links', () => {
  it('opens a playlist link given as a full URL or a path', () => {
    expect(sharedPlaylistRoute(`https://relisten.net/playlists/${code}`)).toBe(route);
    expect(sharedPlaylistRoute(`https://www.relisten.net/playlists/${code}/?ref=share`)).toBe(
      route
    );
    expect(sharedPlaylistRoute(`/playlists/${code}`)).toBe(route);
  });

  it('leaves other links alone', () => {
    expect(sharedPlaylistRoute('/grateful-dead/1977/05/08')).toBeNull();
    expect(sharedPlaylistRoute('/playlists/not-a-code')).toBeNull();
    expect(sharedPlaylistRoute(`https://example.com/playlists/${code}`)).toBeNull();
  });
});
