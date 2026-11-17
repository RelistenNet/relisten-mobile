import { describe, expect, it } from 'vitest';
import type { PlaylistRowGroup } from './playlist_hooks';
import { trackDropAt, trackRows } from './playlist_edit_rows';

function group(segmentId: string, ...entryIds: string[]): PlaylistRowGroup {
  return {
    segment: { segmentId, rank: segmentId },
    entries: entryIds.map((entryId) => ({
      entry: { entryId, segmentId, trackId: `track_${entryId}`, rank: entryId },
      sourceTrack: null,
      status: 'playable' as const,
    })),
  };
}

/** Moves one row the way the draggable list does and reads the drop at its new index. */
function drop(groups: PlaylistRowGroup[], entryId: string, toIndex: number) {
  const rows = trackRows(groups);
  const from = rows.findIndex((r) => r.key === entryId);
  const data = [...rows];
  const [moved] = data.splice(from, 1);
  data.splice(toIndex, 0, moved);
  return trackDropAt(data, toIndex);
}

// Rows: 0 header(g) · 1 scarlet · 2 fire · 3 footer(g) · 4 dew · 5 tweezer
const playlist = [group('g', 'scarlet', 'fire'), group('d', 'dew'), group('t', 'tweezer')];

describe('trackDropAt', () => {
  it('lays out a group between a header and a footer, and singles as plain rows', () => {
    expect(trackRows(playlist).map((r) => r.key)).toEqual([
      'h:g',
      'scarlet',
      'fire',
      'f:g',
      'dew',
      'tweezer',
    ]);
  });

  it('reads a drop right after a header as the start of that group', () => {
    expect(drop(playlist, 'dew', 1)).toEqual({
      kind: 'in_group',
      segmentId: 'g',
      beforeEntryId: 'scarlet',
    });
  });

  it('reads a drop just above the footer as the end of the group', () => {
    expect(drop(playlist, 'dew', 3)).toEqual({
      kind: 'in_group',
      segmentId: 'g',
      afterEntryId: 'fire',
    });
  });

  it('reads a drop just below the footer as not in a group, after that group', () => {
    expect(drop(playlist, 'tweezer', 4)).toEqual({
      kind: 'not_in_group',
      afterSegmentId: 'g',
      beforeSegmentId: 'd',
    });
  });

  it('pulls a grouped track out when it lands among single tracks', () => {
    expect(drop(playlist, 'scarlet', 4)).toEqual({
      kind: 'not_in_group',
      afterSegmentId: 'd',
      beforeSegmentId: 't',
    });
  });

  it('reads a drop at the very top as not in a group, before everything', () => {
    expect(drop(playlist, 'tweezer', 0)).toEqual({
      kind: 'not_in_group',
      afterSegmentId: undefined,
      beforeSegmentId: 'g',
    });
  });
});
