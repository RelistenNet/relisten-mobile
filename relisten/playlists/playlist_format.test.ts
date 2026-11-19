import { describe, expect, it } from 'vitest';
import type { PlaylistRowEntry } from './playlist_hooks';
import { linkedEntriesLabel, markdownPreview } from './playlist_format';

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
