import { describe, expect, it } from 'vitest';
import type { PlaylistRowEntry } from './playlist_hooks';
import { duplicateTracksMessage, linkedEntriesLabel, markdownPreview } from './playlist_format';

function track(entryId: string): PlaylistRowEntry {
  return {
    entry: { entryId, segmentId: 's', trackId: `track_${entryId}`, rank: entryId },
    sourceTrack: null,
    status: 'playable',
  };
}

function note(entryId: string): PlaylistRowEntry {
  return {
    entry: { entryId, segmentId: 's', rank: entryId, description: 'Then the jam' },
    sourceTrack: null,
    status: 'text',
  };
}

describe('edit labels', () => {
  it('counts notes apart from tracks', () => {
    expect(linkedEntriesLabel([track('x'), note('n')])).toBe('Linked · 1 track, 1 note');
    expect(linkedEntriesLabel([track('a'), track('b')])).toBe('Linked · 2 tracks');
  });

  it('previews Markdown as one line of plain text', () => {
    expect(
      markdownPreview('## Set II\n\n> _[Bass enters](#t=6:42)_ here\n- **one**\n2. two `x`')
    ).toBe('Set II Bass enters here one two x');
  });
});

describe('duplicate tracks warning', () => {
  it('names a single repeated track', () => {
    expect(duplicateTracksMessage(1, 1, 'Simple')).toBe('“Simple” is already on this playlist.');
  });

  it('still reads when the single track’s title is not loaded', () => {
    expect(duplicateTracksMessage(1, 1)).toBe('This track is already on this playlist.');
  });

  it('counts when every track repeats, and when some do', () => {
    expect(duplicateTracksMessage(3, 3)).toBe('All 3 tracks are already on this playlist.');
    expect(duplicateTracksMessage(2, 5)).toBe('2 of these 5 tracks are already on this playlist.');
  });
});
