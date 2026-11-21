import { describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/components/menus/native_menu_icons', () => ({
  nativeMenuIcons: { song: 'music.note' },
}));

import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { GO_TO_SONG_PREFIX, goToSongActions, songsOf } from './track_songs';

function track(parts: { ordinal: number; song?: { id: string; name: string } }[]) {
  return { normalization: { parts } } as unknown as Pick<SourceTrack, 'normalization'>;
}

describe('songs of a track', () => {
  it('lists a medley’s songs in the order played', () => {
    const songs = songsOf(
      track([
        { ordinal: 2, song: { id: 'song_fire', name: 'Fire on the Mountain' } },
        { ordinal: 1, song: { id: 'song_scarlet', name: 'Scarlet Begonias' } },
      ])
    );
    expect(songs.map((song) => song.name)).toEqual(['Scarlet Begonias', 'Fire on the Mountain']);
  });

  it('lists a song once when it returns within the track, and skips unmatched parts', () => {
    const songs = songsOf(
      track([
        { ordinal: 1, song: { id: 'song_pl', name: 'Playing in the Band' } },
        { ordinal: 2 },
        { ordinal: 3, song: { id: 'song_pl', name: 'Playing in the Band' } },
      ])
    );
    expect(songs).toEqual([{ id: 'song_pl', name: 'Playing in the Band' }]);
  });

  it('has none for a track that was never normalized', () => {
    expect(songsOf({ normalization: undefined } as Pick<SourceTrack, 'normalization'>)).toEqual([]);
  });
});

describe('Go to Song actions', () => {
  it('offers nothing without songs', () => {
    expect(goToSongActions([])).toEqual([]);
  });

  it('names the one song directly', () => {
    const [action] = goToSongActions([{ id: 'song_fire', name: 'Fire on the Mountain' }]);
    expect(action.title).toBe('Go to Fire on the Mountain');
    expect(action.id).toBe(`${GO_TO_SONG_PREFIX}song_fire`);
    expect(action.subactions).toBeUndefined();
  });

  it('puts several songs in a submenu, one item each', () => {
    const [menu] = goToSongActions([
      { id: 'song_scarlet', name: 'Scarlet Begonias' },
      { id: 'song_fire', name: 'Fire on the Mountain' },
    ]);
    expect(menu.title).toBe('Go to Song');
    expect(menu.subactions?.map((action) => [action.id, action.title])).toEqual([
      [`${GO_TO_SONG_PREFIX}song_scarlet`, 'Scarlet Begonias'],
      [`${GO_TO_SONG_PREFIX}song_fire`, 'Fire on the Mountain'],
    ]);
  });
});
