import { describe, expect, it } from 'vitest';
import { endOfGroupIndex, shuffleKeepingGroups, type GroupedOccurrence } from './queue_groups';

type Occurrence = GroupedOccurrence & { id: string };

const loose = (id: string): Occurrence => ({ id });
const grouped = (id: string, group: string): Occurrence => ({
  id,
  playlistContext: { segmentInstanceId: group },
});

// [scarlet fire] dew [china rider] tweezer
const queue = [
  grouped('scarlet', 'g1'),
  grouped('fire', 'g1'),
  loose('dew'),
  grouped('china', 'g2'),
  grouped('rider', 'g2'),
  loose('tweezer'),
];

/** True when `first` is immediately followed by `second`. */
const adjacent = (ids: string[], first: string, second: string) =>
  ids.indexOf(second) === ids.indexOf(first) + 1;

describe('shuffleKeepingGroups', () => {
  it('keeps every group together and in order, whatever the shuffle', () => {
    for (let run = 0; run < 50; run++) {
      const ids = shuffleKeepingGroups(queue).map((o) => o.id);
      expect(ids).toHaveLength(queue.length);
      expect(adjacent(ids, 'scarlet', 'fire')).toBe(true);
      expect(adjacent(ids, 'china', 'rider')).toBe(true);
    }
  });

  it('puts the playing track first, followed by the rest of its group', () => {
    for (let run = 0; run < 20; run++) {
      const ids = shuffleKeepingGroups(queue, queue[0]).map((o) => o.id);
      expect(ids.slice(0, 2)).toEqual(['scarlet', 'fire']);
    }
  });

  it("splits off a group's earlier tracks when playback is in the middle of it", () => {
    const ids = shuffleKeepingGroups(queue, queue[1]).map((o) => o.id);
    expect(ids[0]).toBe('fire');
    expect(ids).toContain('scarlet');
  });
});

describe('endOfGroupIndex', () => {
  it('finds the last track of the current group, for Play Next while shuffled', () => {
    expect(endOfGroupIndex(queue, 0)).toBe(1);
    expect(endOfGroupIndex(queue, 3)).toBe(4);
  });

  it('leaves a track that is not in a group where it is', () => {
    expect(endOfGroupIndex(queue, 2)).toBe(2);
    expect(endOfGroupIndex(queue, undefined)).toBeUndefined();
  });
});
