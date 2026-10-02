import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn() }));

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => logger },
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

import { AccountLogoutRequest } from './account_logout_request';
import { AccountsApiError } from './accounts_api_client';

const accessToken = 'access-token';

function apiError(status: number | null, retryable: boolean) {
  return new AccountsApiError('Logout failed', status, null, retryable);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AccountLogoutRequest', () => {
  it('completes on the first attempt', async () => {
    const transport = { request: vi.fn().mockResolvedValue(undefined) };

    await new AccountLogoutRequest(transport as never).send(accessToken);

    expect(transport.request).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledExactlyOnceWith('Remote session logout outcome=completed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a timed-out attempt and then succeeds', async () => {
    const transport = {
      request: vi
        .fn()
        .mockReturnValueOnce(new Promise(() => undefined))
        .mockResolvedValueOnce(undefined),
    };
    const logout = new AccountLogoutRequest(transport as never).send(accessToken);

    const firstSignal = (transport.request.mock.calls[0][2] as RequestInit).signal;
    await vi.advanceTimersByTimeAsync(3999);
    expect(firstSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(firstSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(249);
    expect(transport.request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await logout;

    const secondSignal = (transport.request.mock.calls[1][2] as RequestInit).signal;
    expect(secondSignal?.aborted).toBe(false);
    expect(firstSignal).not.toBe(secondSignal);
    expect(logger.info).toHaveBeenCalledExactlyOnceWith('Remote session logout outcome=completed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a retryable server failure', async () => {
    const transport = {
      request: vi.fn().mockRejectedValueOnce(apiError(503, true)).mockResolvedValueOnce(undefined),
    };
    const logout = new AccountLogoutRequest(transport as never).send(accessToken);

    await vi.advanceTimersByTimeAsync(250);
    await logout;

    expect(transport.request).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledExactlyOnceWith('Remote session logout outcome=completed');
  });

  it('stops after a non-retryable failure', async () => {
    const transport = { request: vi.fn().mockRejectedValue(apiError(401, false)) };

    await new AccountLogoutRequest(transport as never).send(accessToken);

    expect(transport.request).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledExactlyOnceWith('Remote session logout outcome=terminal');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops after three retryable failures', async () => {
    const transport = { request: vi.fn().mockRejectedValue(apiError(429, true)) };
    const logout = new AccountLogoutRequest(transport as never).send(accessToken);

    await vi.advanceTimersByTimeAsync(249);
    expect(transport.request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(749);
    expect(transport.request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await logout;

    expect(transport.request).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledExactlyOnceWith('Remote session logout outcome=exhausted');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('records when no access token is available', async () => {
    const transport = { request: vi.fn() };

    await new AccountLogoutRequest(transport as never).send(null);

    expect(transport.request).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      'Remote session logout outcome=no_access_token'
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
