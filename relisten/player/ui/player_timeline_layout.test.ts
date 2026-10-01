import { describe, expect, it } from 'vitest';
import {
  playerTimelineFooterHeight,
  playerTimelineSnapOffsets,
  reconciledPlayerTimelineOffset,
} from './player_timeline_layout';

describe('player timeline resting positions', () => {
  const layout = { y: 240, height: 580 };
  const viewport = 740;
  const compactHeight = 160;

  it('places Now Playing at the top and Up Next immediately below compact transport', () => {
    const offsets = playerTimelineSnapOffsets(layout, viewport, false, compactHeight)!;
    expect(layout.y - offsets[offsets.length - 2]).toBe(0);
    expect(layout.y + layout.height - offsets[offsets.length - 1]).toBe(compactHeight);
  });

  it('adds a history resting position before Now Playing while preserving both queue endpoints', () => {
    expect(
      playerTimelineSnapOffsets({ y: 1000, height: 580 }, viewport, false, compactHeight)
    ).toEqual([260, 1000, 1420]);
    expect(
      playerTimelineSnapOffsets({ y: 100, height: 580 }, viewport, false, compactHeight)
    ).toEqual([0, 100, 520]);
    expect(
      playerTimelineSnapOffsets({ y: 0, height: 580 }, viewport, false, compactHeight)
    ).toEqual([0, 420]);
  });

  it('does not settle an unmeasured, reordered, or scrubbed timeline', () => {
    expect(playerTimelineSnapOffsets(undefined, viewport, false, compactHeight)).toBeUndefined();
    expect(playerTimelineSnapOffsets(layout, viewport, true, compactHeight)).toBeUndefined();
    expect(playerTimelineSnapOffsets({ y: 0, height: 0 }, viewport, false)).toBeUndefined();
  });

  it('leaves oversized player content freely scrollable so all controls remain reachable', () => {
    expect(
      playerTimelineSnapOffsets({ y: 0, height: 900 }, viewport, false, compactHeight)
    ).toBeUndefined();
    expect(playerTimelineSnapOffsets(layout, viewport, false, 600)).toBeUndefined();
  });

  it.each([0, 48, 120, 1600])(
    'makes the queue endpoint reachable with %i points of queue content',
    (queueHeight) => {
      const queueViewport = viewport - compactHeight;
      const footer = playerTimelineFooterHeight(queueViewport, queueHeight, 50);
      const contentHeight = layout.y + layout.height + queueHeight + footer;
      const maximumOffset = contentHeight - viewport;
      const queueOffset = playerTimelineSnapOffsets(layout, viewport, false, compactHeight)!.at(
        -1
      )!;
      expect(maximumOffset).toBeGreaterThanOrEqual(queueOffset);
      expect(footer).toBeGreaterThanOrEqual(50);
      if (queueHeight >= queueViewport) expect(footer).toBe(50);
    }
  );

  it('keeps the same queue row under the header after earlier history and player height change', () => {
    const next = { y: 340, height: 620 };
    const queueOffset = layout.y + layout.height - compactHeight;
    const before = queueOffset + 175;
    const after = reconciledPlayerTimelineOffset(before, layout, next, compactHeight);
    expect(after - (next.y + next.height - compactHeight)).toBe(175);
  });

  it('keeps the player anchored when new history arrives and leaves earlier history browsing alone', () => {
    const next = { y: 340, height: 620 };
    expect(reconciledPlayerTimelineOffset(layout.y, layout, next, compactHeight)).toBe(next.y);
    expect(reconciledPlayerTimelineOffset(80, layout, next, compactHeight)).toBe(80);
  });
  it('keeps the queue anchored when a longer title increases compact transport height', () => {
    const before = layout.y + layout.height - compactHeight + 80;
    const after = reconciledPlayerTimelineOffset(
      before,
      layout,
      layout,
      compactHeight,
      compactHeight + 40
    );
    expect(after - (layout.y + layout.height - compactHeight - 40)).toBe(80);
  });
});
