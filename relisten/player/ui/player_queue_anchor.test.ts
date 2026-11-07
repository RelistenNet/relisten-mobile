import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayerQueueAnchor } from './player_queue_anchor';

describe('queue anchor requests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('bounds retries for an unmeasured distant item despite repeated layout notifications', () => {
    const list = { scrollToIndex: vi.fn(), scrollToOffset: vi.fn() };
    const anchor = createPlayerQueueAnchor(() => list);
    list.scrollToIndex.mockImplementation(({ index }) =>
      anchor.onFailure({ index, averageItemLength: 68 })
    );

    anchor.start(150);
    for (let pass = 0; pass < 12; pass += 1) {
      for (let event = 0; event < 8; event += 1) anchor.retryAfterLayout();
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
      vi.advanceTimersByTime(60);
    }
    expect(list.scrollToIndex).toHaveBeenCalledTimes(4);
    expect(list.scrollToOffset).toHaveBeenCalledWith({ offset: 10200, animated: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not realign after a user scroll cancels a queued layout retry', () => {
    const list = { scrollToIndex: vi.fn(), scrollToOffset: vi.fn() };
    const anchor = createPlayerQueueAnchor(() => list);
    anchor.start(17);
    anchor.retryAfterLayout();
    anchor.cancel();
    vi.runAllTimers();
    expect(list.scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('retires the previous target and stops retrying once the new target is visible', () => {
    const list = { scrollToIndex: vi.fn(), scrollToOffset: vi.fn() };
    const anchor = createPlayerQueueAnchor(() => list);
    list.scrollToIndex.mockImplementation(({ index }) =>
      anchor.onFailure({ index, averageItemLength: 68 })
    );
    anchor.start(150);
    anchor.start(151);
    anchor.onFailure({ index: 150, averageItemLength: 68 });
    anchor.onVisibleIndex(151);
    vi.runAllTimers();
    expect(list.scrollToIndex.mock.calls.map(([options]) => options.index)).toEqual([150, 151]);
    expect(list.scrollToOffset).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for the list to mount and coalesces layout retries', () => {
    const list = { scrollToIndex: vi.fn(), scrollToOffset: vi.fn() };
    let mounted = false;
    const anchor = createPlayerQueueAnchor(() => (mounted ? list : null));
    anchor.start(17);
    mounted = true;
    anchor.retryAfterLayout();
    anchor.retryAfterLayout();
    vi.runAllTimers();
    expect(list.scrollToIndex).toHaveBeenCalledExactlyOnceWith({
      index: 17,
      animated: false,
      viewPosition: 0,
    });
  });
});
