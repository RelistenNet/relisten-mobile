import { describe, expect, it, vi } from 'vitest';
import type { PlaylistRowEntry, PlaylistRowGroup } from './playlist_hooks';

// The hooks module reaches React Native through Realm's schema, the catalog
// models and ID generation; the function under test needs none of them.
vi.mock('@/relisten/realm/schema', () => ({}));
vi.mock('@/relisten/realm/models/source_track', () => ({ SourceTrack: class {} }));
vi.mock('expo-crypto', () => ({}));

const { reuseUnchangedRows } = await import('./playlist_hooks');

function trackRow(entryId: string, trackDisplay?: string): PlaylistRowEntry {
  return {
    entry: { entryId, segmentId: `s_${entryId}`, trackId: `track_${entryId}`, rank: entryId },
    sourceTrack: null,
    status: 'playable',
    trackDisplay,
  };
}

function single(row: PlaylistRowEntry): PlaylistRowGroup {
  return { segment: { segmentId: row.entry.segmentId, rank: row.entry.rank }, entries: [row] };
}

describe('reuseUnchangedRows', () => {
  it('keeps unchanged rows and groups, and replaces the one whose download moved on', () => {
    const previous = [single(trackRow('a', 'Queued:1')), single(trackRow('b', 'Queued:1'))];
    // A fresh build, as after any catalog write: equal content, new objects.
    const next = [single(trackRow('a', 'Queued:1')), single(trackRow('b', 'Succeeded:1'))];

    const result = reuseUnchangedRows(previous, next);

    expect(result[0]).toBe(previous[0]);
    expect(result[1]).not.toBe(previous[1]);
    expect(result[1]!.entries[0]!.trackDisplay).toBe('Succeeded:1');
    // The totals read the array as a whole, so it changes even when every group is kept.
    expect(reuseUnchangedRows(result, result.map(clone))).not.toBe(result);
  });

  it('gives a group new identity when its entries reorder', () => {
    const a = trackRow('a');
    const b = { ...trackRow('b'), entry: { ...trackRow('b').entry, segmentId: 's_a' } };
    const group: PlaylistRowGroup = { segment: { segmentId: 's_a', rank: 'a' }, entries: [a, b] };
    const reordered = { ...group, entries: [clone1(b), clone1(a)] };

    const [result] = reuseUnchangedRows([group], [reordered]);

    expect(result).not.toBe(group);
    expect(result!.entries[0]).toBe(b);
    expect(result!.entries[1]).toBe(a);
  });
});

function clone1(row: PlaylistRowEntry): PlaylistRowEntry {
  return { ...row, entry: { ...row.entry } };
}

function clone(group: PlaylistRowGroup): PlaylistRowGroup {
  return { ...group, segment: { ...group.segment }, entries: group.entries.map(clone1) };
}
