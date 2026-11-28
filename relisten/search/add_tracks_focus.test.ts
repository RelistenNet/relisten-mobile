import { describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/components/menus/native_menu_icons', () => ({ nativeMenuIcons: {} }));

import { focusSetlistTracks } from './add_tracks_focus';

function track(uuid: string, songIds: string[]) {
  return {
    uuid,
    normalization: {
      parts: songIds.map((id, ordinal) => ({ ordinal, song: { id, name: id } })),
    },
  } as never;
}

describe('focusSetlistTracks', () => {
  const setlist = [
    track('set1-lawn-boy', ['song_lawnboy']),
    track('set1-other', ['song_other']),
    track('encore-lawn-boy', ['song_lawnboy']),
    track('medley', ['song_scarlet', 'song_fire']),
  ];

  it('highlights every file of the song, Set 1 and Encore alike', () => {
    const { highlighted, scrollTargetUuid } = focusSetlistTracks(setlist, {
      songId: 'song_lawnboy',
    });
    expect([...highlighted]).toEqual(['set1-lawn-boy', 'encore-lawn-boy']);
    expect(scrollTargetUuid).toBe('set1-lawn-boy');
  });

  it('scrolls to the exact preview even when the same song has an earlier file', () => {
    const focus = focusSetlistTracks(setlist, {
      songId: 'song_lawnboy',
      trackUuid: 'encore-lawn-boy',
    });
    expect(focus.scrollTargetUuid).toBe('encore-lawn-boy');
    expect(focus.highlighted.has('set1-lawn-boy')).toBe(true);
  });

  it('matches a song inside a medley', () => {
    expect([...focusSetlistTracks(setlist, { songId: 'song_fire' }).highlighted]).toEqual([
      'medley',
    ]);
  });

  it('keeps an exact file even without a song', () => {
    expect([...focusSetlistTracks(setlist, { trackUuid: 'set1-other' }).highlighted]).toEqual([
      'set1-other',
    ]);
  });

  it('highlights nothing for a source with no matching file', () => {
    expect(focusSetlistTracks(setlist, { songId: 'song_missing' }).highlighted.size).toBe(0);
  });
});
