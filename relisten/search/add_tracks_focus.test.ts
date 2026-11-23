import { describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/components/menus/native_menu_icons', () => ({ nativeMenuIcons: {} }));

import { focusedTrackUuids } from './add_tracks_focus';

function track(uuid: string, songIds: string[]) {
  return {
    uuid,
    normalization: {
      parts: songIds.map((id, ordinal) => ({ ordinal, song: { id, name: id } })),
    },
  } as never;
}

describe('focusedTrackUuids', () => {
  const setlist = [
    track('set1-lawn-boy', ['song_lawnboy']),
    track('set1-other', ['song_other']),
    track('encore-lawn-boy', ['song_lawnboy']),
    track('medley', ['song_scarlet', 'song_fire']),
  ];

  it('highlights every file of the song, Set 1 and Encore alike', () => {
    expect([...focusedTrackUuids(setlist, { songId: 'song_lawnboy' })]).toEqual([
      'set1-lawn-boy',
      'encore-lawn-boy',
    ]);
  });

  it('matches a song inside a medley', () => {
    expect([...focusedTrackUuids(setlist, { songId: 'song_fire' })]).toEqual(['medley']);
  });

  it('keeps an exact file even without a song', () => {
    expect([...focusedTrackUuids(setlist, { trackUuid: 'set1-other' })]).toEqual(['set1-other']);
  });

  it('highlights nothing for a source with no matching file', () => {
    expect(focusedTrackUuids(setlist, { songId: 'song_missing' }).size).toBe(0);
  });
});
