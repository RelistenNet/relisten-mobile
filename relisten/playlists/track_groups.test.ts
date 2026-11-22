import { describe, expect, it } from 'vitest';
import { withoutTracks } from './track_groups';

describe('withoutTracks', () => {
  it('splits a linked run where a track was dropped, so its neighbors stay unlinked', () => {
    expect(withoutTracks([['t1', 't2', 't3']], new Set(['t2']))).toEqual([['t1'], ['t3']]);
  });

  it('keeps a run linked when only its ends are dropped, and drops emptied groups', () => {
    expect(withoutTracks([['t1', 't2', 't3'], ['t4']], new Set(['t1', 't4']))).toEqual([
      ['t2', 't3'],
    ]);
  });
});
