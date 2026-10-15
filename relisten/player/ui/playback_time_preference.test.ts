import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
vi.mock('@/relisten/util/logging', () => ({ log: { warn: vi.fn() } }));

beforeEach(() => {
  vi.resetModules();
  storage.getItem.mockReset().mockResolvedValue(null);
  storage.setItem.mockReset().mockResolvedValue(undefined);
});

async function preference() {
  return (await import('./playback_time_preference')).playbackTimePreference;
}

describe('player time display preference', () => {
  it('defaults to duration, synchronizes both headers, and removes subscriptions', async () => {
    const display = await preference();
    const expanded = vi.fn();
    const compact = vi.fn();
    const unsubscribe = display.subscribe(expanded);
    display.subscribe(compact);
    await display.load();
    expect(display.getSnapshot()).toBe('duration');
    await display.toggle();
    expect(display.getSnapshot()).toBe('remaining');
    expect(expanded).toHaveBeenCalledOnce();
    expect(compact).toHaveBeenCalledOnce();
    unsubscribe();
    await display.toggle();
    expect(display.getSnapshot()).toBe('duration');
    expect(expanded).toHaveBeenCalledOnce();
    expect(compact).toHaveBeenCalledTimes(2);
  });

  it('restores the last selection after a new process loads', async () => {
    const saved = new Map<string, string>();
    storage.getItem.mockImplementation(async (key) => saved.get(key) ?? null);
    storage.setItem.mockImplementation(async (key, value) => {
      saved.set(key, value);
    });
    const first = await preference();
    await first.load();
    await first.toggle();
    vi.resetModules();
    const restored = await preference();
    await restored.load();
    expect(restored.getSnapshot()).toBe('remaining');
  });

  it('does not let a late storage read overwrite a tap', async () => {
    let finishRead!: (value: string | null) => void;
    storage.getItem.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        })
    );
    const display = await preference();
    const loading = display.load();
    await display.toggle();
    await display.toggle();
    finishRead('remaining');
    await loading;
    expect(display.getSnapshot()).toBe('duration');
  });

  it('saves rapid changes in tap order', async () => {
    let finishFirstWrite!: () => void;
    const saved: string[] = [];
    storage.setItem
      .mockImplementationOnce(
        (_key, value) =>
          new Promise<void>((resolve) => {
            finishFirstWrite = () => {
              saved.push(value);
              resolve();
            };
          })
      )
      .mockImplementation(async (_key, value) => {
        saved.push(value);
      });
    const display = await preference();
    void display.toggle();
    const lastWrite = display.toggle();
    await Promise.resolve();
    expect(saved).toEqual([]);
    finishFirstWrite();
    await lastWrite;
    expect(saved).toEqual(['remaining', 'duration']);
  });

  it('keeps the control usable after storage errors', async () => {
    storage.getItem.mockRejectedValueOnce(new Error('temporarily unavailable'));
    storage.setItem.mockRejectedValueOnce(new Error('temporarily unavailable'));
    const display = await preference();
    await display.load();
    await display.toggle();
    expect(display.getSnapshot()).toBe('remaining');
    await display.toggle();
    expect(display.getSnapshot()).toBe('duration');
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });
});
