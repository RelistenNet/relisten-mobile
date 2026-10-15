import { describe, expect, it } from 'vitest';
import { isQueueReorderCurrent } from './player_queue_reorder';

describe('queue reorder ownership', () => {
  const started = ['now-playing', 'up-next-a', 'up-next-b'];

  it('accepts completion while the same tracks still occupy the same timeline slots', () => {
    expect(isQueueReorderCurrent(started, [...started])).toBe(true);
  });

  it('rejects completion after playback advances and changes the meaning of row indices', () => {
    expect(isQueueReorderCurrent(started, ['earlier-a', 'now-playing', 'up-next-b'])).toBe(false);
  });

  it('rejects completion when the queue is cleared, replaced, or reordered elsewhere', () => {
    expect(isQueueReorderCurrent(started, ['now-playing'])).toBe(false);
    expect(isQueueReorderCurrent(started, ['now-playing', 'up-next-b', 'up-next-a'])).toBe(false);
    expect(isQueueReorderCurrent(started, ['now-playing', 'up-next-x', 'up-next-y'])).toBe(false);
  });

  it('ignores a duplicate or cancelled completion without an active reorder', () => {
    expect(isQueueReorderCurrent(null, started)).toBe(false);
  });
});
