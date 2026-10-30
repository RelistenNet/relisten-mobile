import { describe, expect, it, vi } from 'vitest';
import { createPlayerCloseCompletion } from './player_close_completion';

describe('player close completion', () => {
  it('closes before navigating and ignores duplicate animation delivery', () => {
    const events: string[] = [];
    const closing = createPlayerCloseCompletion(() => events.push('closed'));
    const complete = closing.begin(() => events.push('navigate'));
    expect(events).toEqual([]);
    complete();
    complete();
    expect(events).toEqual(['closed', 'navigate']);
  });

  it('uses a fresh remote callback for repeated closes', () => {
    const onClosed = vi.fn();
    const closing = createPlayerCloseCompletion(onClosed);
    const first = closing.begin();
    first();
    const second = closing.begin();
    expect(second).not.toBe(first);
    first();
    second();
    expect(onClosed).toHaveBeenCalledTimes(2);
  });

  it('does not close or navigate after reopening, dragging, resetting, or unmounting', () => {
    const onClosed = vi.fn();
    const navigate = vi.fn();
    const closing = createPlayerCloseCompletion(onClosed);
    const complete = closing.begin(navigate);
    closing.cancel();
    complete();
    expect(onClosed).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('only completes the latest request when old native callbacks arrive late', () => {
    const onClosed = vi.fn();
    const firstNavigation = vi.fn();
    const secondNavigation = vi.fn();
    const closing = createPlayerCloseCompletion(onClosed);
    const oldCompletion = closing.begin(firstNavigation);
    const newCompletion = closing.begin(secondNavigation);
    oldCompletion();
    expect(onClosed).not.toHaveBeenCalled();
    newCompletion();
    expect(firstNavigation).not.toHaveBeenCalled();
    expect(secondNavigation).toHaveBeenCalledTimes(1);
  });
});
