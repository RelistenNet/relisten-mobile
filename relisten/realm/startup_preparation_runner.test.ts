import { describe, expect, it, vi } from 'vitest';
import { createStartupPreparationRunner } from './startup_preparation_runner';

describe('createStartupPreparationRunner', () => {
  it('retains one retry signal received while a failed preparation is in flight', async () => {
    let rejectFirst!: (error: Error) => void;
    const prepare = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          })
      )
      .mockResolvedValueOnce();
    const onReady = vi.fn();
    const onError = vi.fn();
    const runner = createStartupPreparationRunner({ prepare, onReady, onError });

    runner.request();
    runner.request();
    rejectFirst(new Error('protected storage is locked'));

    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(onError).toHaveBeenCalledOnce();
  });

  it('waits for another signal after a failed preparation settles', async () => {
    const prepare = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('still locked'));
    const onError = vi.fn();
    const runner = createStartupPreparationRunner({ prepare, onReady: vi.fn(), onError });

    runner.request();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(prepare).toHaveBeenCalledOnce();

    runner.request();
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
  });
});
