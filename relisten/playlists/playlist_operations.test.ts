import { describe, expect, it } from 'vitest';
import {
  applyPlaylistOperation,
  MAX_RANK_LENGTH,
  type EntryState,
  type PlaylistOperation,
  type PlaylistSnapshot,
  type SegmentState,
  orderedGroups,
} from './playlist_operations';

function apply(snapshot: PlaylistSnapshot, operation: PlaylistOperation): PlaylistSnapshot {
  const { changes } = applyPlaylistOperation(snapshot, operation);
  const segments = new Map(snapshot.segments);
  const entries = new Map(snapshot.entries);
  changes.upsertSegments.forEach((s) => segments.set(s.segmentId, s));
  changes.upsertEntries.forEach((e) => entries.set(e.entryId, e));
  changes.deleteEntryIds.forEach((id) => entries.delete(id));
  changes.deleteSegmentIds.forEach((id) => segments.delete(id));
  return { segments, entries };
}

const empty = (): PlaylistSnapshot => ({
  segments: new Map<string, SegmentState>(),
  entries: new Map<string, EntryState>(),
});

/** Renders a playlist as "[a b] c" so expectations read like the screen. */
function layout(snapshot: PlaylistSnapshot) {
  return orderedGroups(snapshot)
    .map((g) => {
      const ids = g.entries.map((e) => e.entryId).join(' ');
      return g.entries.length > 1 ? `[${ids}]` : ids;
    })
    .join(' ');
}

function build(...groups: string[][]): PlaylistSnapshot {
  return groups.reduce(
    (snapshot, ids, index) =>
      apply(snapshot, {
        type: 'insert_segment',
        segmentId: `s${index}`,
        entries: ids.map((id) => ({ entryId: id, trackId: `track_${id}` })),
      }),
    empty()
  );
}

describe('applyPlaylistOperation', () => {
  it('appends segments and keeps entries in order', () => {
    expect(layout(build(['scarlet', 'fire'], ['dew']))).toBe('[scarlet fire] dew');
  });

  it('moves a track within its group and reports a move to the same place as a no-op', () => {
    const playlist = build(['a', 'b', 'c']);
    const moved = apply(playlist, {
      type: 'move_entry',
      entryId: 'c',
      destination: { segmentId: 's0', beforeEntryId: 'a' },
    });
    expect(layout(moved)).toBe('[c a b]');

    const same = applyPlaylistOperation(playlist, {
      type: 'move_entry',
      entryId: 'b',
      destination: { segmentId: 's0', afterEntryId: 'a' },
    });
    expect(same.status).toBe('no_op');
  });

  it('pulls a track into a new group placed after the group it left', () => {
    const playlist = build(['scarlet', 'fire'], ['dew']);
    const moved = apply(playlist, {
      type: 'move_entry',
      entryId: 'scarlet',
      destination: { newSegmentId: 'n', afterSegmentId: 's0' },
    });
    expect(layout(moved)).toBe('fire scarlet dew');
  });

  it('removes a group when its last track leaves, after resolving anchors against it', () => {
    const playlist = build(['a'], ['b']);
    const moved = apply(playlist, {
      type: 'move_entry',
      entryId: 'a',
      destination: { newSegmentId: 'n', afterSegmentId: 's0' },
    });
    expect(layout(moved)).toBe('a b');
    expect(moved.segments.has('s0')).toBe(false);

    const deleted = apply(build(['x'], ['y']), { type: 'delete_entry', entryId: 'x' });
    expect([...deleted.segments.keys()]).toEqual(['s1']);
  });

  it('never fails placement: missing or wrong-parent anchors append, inverted anchors keep after', () => {
    const playlist = build(['a', 'b'], ['c', 'd']);
    const missing = apply(playlist, {
      type: 'insert_entries',
      segmentId: 's0',
      afterEntryId: 'gone',
      entries: [{ entryId: 'x', trackId: 't' }],
    });
    expect(layout(missing)).toBe('[a b x] [c d]');

    const wrongParent = apply(playlist, {
      type: 'insert_entries',
      segmentId: 's0',
      beforeEntryId: 'c',
      entries: [{ entryId: 'x', trackId: 't' }],
    });
    expect(layout(wrongParent)).toBe('[a b x] [c d]');

    const inverted = apply(playlist, {
      type: 'insert_entries',
      segmentId: 's0',
      afterEntryId: 'b',
      beforeEntryId: 'a',
      entries: [{ entryId: 'x', trackId: 't' }],
    });
    expect(layout(inverted)).toBe('[a b x] [c d]');
  });

  it('reports a missing destination group without changing anything', () => {
    const result = applyPlaylistOperation(build(['a']), {
      type: 'move_entry',
      entryId: 'a',
      destination: { segmentId: 'gone' },
    });
    expect(result.status).toBe('parent_missing');
  });

  it('respaces siblings instead of storing ranks past the length cap', () => {
    let playlist = build(['a', 'b']);
    for (let i = 0; i < 400; i++) {
      playlist = apply(playlist, {
        type: 'insert_entries',
        segmentId: 's0',
        afterEntryId: 'a',
        entries: [{ entryId: `x${i}`, trackId: 't' }],
      });
    }
    const ranks = [...playlist.entries.values()].map((e) => e.rank);
    expect(Math.max(...ranks.map((r) => r.length))).toBeLessThanOrEqual(MAX_RANK_LENGTH);
    expect(layout(playlist).startsWith('[a x399 x398')).toBe(true);
    expect(layout(playlist).endsWith('x0 b]')).toBe(true);
  });
});
