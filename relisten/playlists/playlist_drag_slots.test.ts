import { describe, expect, it } from 'vitest';
import type { PlaylistRowGroup } from './playlist_hooks';
import {
  editItems,
  gaplessY,
  nearestSlot,
  planLinkDrag,
  planTrackDrag,
} from './playlist_drag_slots';

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

const metrics = { trackHeight: 56, linkHeight: 36 };

// [scarlet fire] dew tweezer
const playlist = [group('g', 'scarlet', 'fire'), group('d', 'dew'), group('t', 'tweezer')];

const pick = (plan: ReturnType<typeof planTrackDrag>, y: number) =>
  plan.slots[
    nearestSlot(
      plan.slots.map((s) => s.y),
      plan.slots.map((s) => !!s.linkTarget),
      y,
      -1,
      metrics.trackHeight
    )
  ];

describe('edit items', () => {
  it('puts a link line above linked tracks and nothing above single tracks', () => {
    expect(editItems(playlist).map((i) => i.key)).toEqual([
      'link:g',
      'scarlet',
      'fire',
      'dew',
      'tweezer',
    ]);
  });
});

describe('planTrackDrag', () => {
  it("offers both sides of a link's end at the same seam, half a row apart", () => {
    const plan = planTrackDrag(playlist, 'tweezer', metrics);
    // Seam under fire: link line 36 + two tracks.
    const seam = 36 + 56 * 2;
    expect(pick(plan, seam - 10)).toMatchObject({
      inLink: true,
      drop: {
        drop: { kind: 'in_group', segmentId: 'g', afterEntryId: 'fire' },
      },
    });
    expect(pick(plan, seam + 10)).toMatchObject({
      inLink: false,
      label: 'Not linked',
      drop: {
        drop: {
          kind: 'not_in_group',
          afterSegmentId: 'g',
          beforeSegmentId: 'd',
        },
      },
    });
  });

  it('offers the start of a link just under its line, and above the link outside it', () => {
    const plan = planTrackDrag(playlist, 'dew', metrics);
    expect(pick(plan, 0)).toMatchObject({
      inLink: false,
      drop: { drop: { beforeSegmentId: 'g' } },
    });
    expect(pick(plan, 36)).toMatchObject({
      inLink: true,
      drop: {
        drop: { kind: 'in_group', segmentId: 'g', beforeEntryId: 'scarlet' },
      },
    });
  });

  it('starts at the slot the track came from, so dropping it in place changes nothing', () => {
    const fromLink = planTrackDrag(playlist, 'fire', metrics);
    expect(fromLink.slots[fromLink.initialSlot].drop).toEqual({
      kind: 'track',
      drop: { kind: 'in_group', segmentId: 'g', afterEntryId: 'scarlet' },
    });
    const single = planTrackDrag(playlist, 'dew', metrics);
    expect(single.slots[single.initialSlot].drop).toEqual({
      kind: 'track',
      drop: { kind: 'not_in_group', afterSegmentId: 'g', beforeSegmentId: 't' },
    });
  });

  it('lets a held drag link onto a single track, never by position alone', () => {
    const plan = planTrackDrag(playlist, 'tweezer', metrics);
    const target = plan.hoverTargets[0];
    expect(plan.slots[target.slotIndex]).toMatchObject({
      linkTarget: true,
      drop: { drop: { kind: 'in_group', segmentId: 'd', afterEntryId: 'dew' } },
    });
    expect(pick(plan, target.top + 56).linkTarget).toBeUndefined();
  });
});

describe('planLinkDrag', () => {
  it('folds the other links to one row each and drops only between them', () => {
    const plan = planLinkDrag(playlist, 'g', metrics);
    expect(plan.items.map((i) => i.kind)).toEqual(['collapsed', 'collapsed']);
    expect(plan.slots.map((s) => s.drop)).toEqual([
      { kind: 'segment', afterSegmentId: undefined, beforeSegmentId: 'd' },
      { kind: 'segment', afterSegmentId: 'd', beforeSegmentId: 't' },
      { kind: 'segment', afterSegmentId: 't', beforeSegmentId: undefined },
    ]);
    expect(plan.initialSlot).toBe(0);
  });
});

describe('gaplessY', () => {
  it('treats the open placeholder as a single point', () => {
    expect(gaplessY(10, 100, 56)).toBe(10);
    expect(gaplessY(120, 100, 56)).toBe(100);
    expect(gaplessY(200, 100, 56)).toBe(144);
  });
});
