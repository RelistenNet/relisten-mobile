import { describe, expect, it } from 'vitest';
import { isPlayerTimelineReleaseAtRest, PlayerTimelineHaptics } from './player_timeline_haptics';

const layout = { y: 240, height: 600 };
const compactHeight = 180;
const expanded = layout.y;
const compact = layout.y + layout.height - compactHeight;

describe('settled player breakpoint feedback', () => {
  it('confirms one new endpoint and ignores repeated native completion delivery', () => {
    const feedback = new PlayerTimelineHaptics();
    feedback.begin(expanded, layout, compactHeight);
    expect(feedback.settle(compact, layout, compactHeight)).toBe(true);
    expect(feedback.settle(compact, layout, compactHeight)).toBe(false);

    feedback.begin(compact, layout, compactHeight);
    expect(feedback.settle(expanded + 0.5, layout, compactHeight)).toBe(true);
  });

  it('keeps mount, ordinary queue browsing, and a drag back to its origin silent', () => {
    const feedback = new PlayerTimelineHaptics();
    expect(feedback.settle(expanded, layout, compactHeight)).toBe(false);
    feedback.begin(expanded, layout, compactHeight);
    expect(feedback.settle(expanded, layout, compactHeight)).toBe(false);
    feedback.begin(compact, layout, compactHeight);
    expect(feedback.settle(compact + 100, layout, compactHeight)).toBe(false);
    expect(feedback.settle(expanded, layout, compactHeight)).toBe(false);
  });

  it('ignores cancelled interactions and layout changes beneath a pending scroll', () => {
    const feedback = new PlayerTimelineHaptics();
    feedback.begin(expanded, layout, compactHeight);
    feedback.cancel();
    expect(feedback.settle(compact, layout, compactHeight)).toBe(false);
    feedback.begin(expanded, layout, compactHeight);
    expect(feedback.settle(compact + 40, { ...layout, height: 640 }, compactHeight)).toBe(false);
    expect(feedback.settle(compact, layout, compactHeight)).toBe(false);
  });

  it('waits for a button destination when an interrupted animation reports its old endpoint', () => {
    const feedback = new PlayerTimelineHaptics();
    feedback.begin(expanded, layout, compactHeight, compact);
    feedback.begin(compact - 40, layout, compactHeight, expanded);
    expect(feedback.settle(compact, layout, compactHeight)).toBe(false);
    expect(feedback.settle(expanded, layout, compactHeight)).toBe(true);
    expect(feedback.settle(expanded, layout, compactHeight)).toBe(false);
  });

  it('confirms explicit button destinations and keeps tapping the current endpoint silent', () => {
    const feedback = new PlayerTimelineHaptics();
    feedback.begin(expanded, layout, compactHeight, compact);
    expect(feedback.settle(compact, layout, compactHeight)).toBe(true);
    feedback.begin(compact, layout, compactHeight, expanded);
    expect(feedback.settle(expanded, layout, compactHeight)).toBe(true);
    feedback.begin(expanded, layout, compactHeight, expanded);
    expect(feedback.settle(expanded, layout, compactHeight)).toBe(false);
  });

  it('does not finish a release that will decelerate or snap to another position', () => {
    const release = {
      contentOffset: { x: 0, y: expanded },
      targetContentOffset: { x: 0, y: compact },
      velocity: { x: 0, y: 0 },
    };
    expect(isPlayerTimelineReleaseAtRest(release)).toBe(false);
    expect(
      isPlayerTimelineReleaseAtRest({ ...release, targetContentOffset: release.contentOffset })
    ).toBe(true);
    expect(
      isPlayerTimelineReleaseAtRest({
        ...release,
        targetContentOffset: release.contentOffset,
        velocity: { x: 0, y: 0.2 },
      })
    ).toBe(false);
  });
});
