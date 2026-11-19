import { describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn() }) },
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

// account_errors reads AuthFlowError from the auth client, which loads Expo modules.
vi.mock('../auth/auth_client', () => ({ AuthFlowError: class AuthFlowError extends Error {} }));

import { AccountDeletionRequest } from './account_deletion_request';
import { AccountsApiError } from './accounts_api_client';

const current = () => true;

function request(...results: unknown[]) {
  const accountsApi = { request: vi.fn() };
  for (const result of results) {
    if (result instanceof Error) {
      accountsApi.request.mockRejectedValueOnce(result);
    } else {
      accountsApi.request.mockResolvedValueOnce(result);
    }
  }
  const wait = vi.fn().mockResolvedValue(undefined);
  return { accountsApi, wait, deletion: new AccountDeletionRequest(accountsApi as never, wait) };
}

describe('AccountDeletionRequest', () => {
  it('posts to the deletion endpoint and reports acceptance', async () => {
    const { accountsApi, deletion } = request({ state: 'deleting' });

    await expect(deletion.send({}, current)).resolves.toBe('accepted');
    expect(accountsApi.request).toHaveBeenCalledExactlyOnceWith(
      '/v1/account-deletions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('retries a network error and an unconfirmed start with the same Apple code', async () => {
    const { accountsApi, wait, deletion } = request(
      new AccountsApiError('Offline', null, null, true),
      new AccountsApiError('Unavailable', 503, null, true),
      { state: 'deleting' }
    );

    await expect(
      deletion.send({ apple_native_authorization_code: 'apple-code' }, current)
    ).resolves.toBe('accepted');
    expect(accountsApi.request).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    for (const [, options] of accountsApi.request.mock.calls) {
      expect(options.body).toBe('{"apple_native_authorization_code":"apple-code"}');
    }
  });

  it('sends nothing when the session changed before the first attempt', async () => {
    const { accountsApi, deletion } = request({ state: 'deleting' });

    await expect(deletion.send({}, () => false)).resolves.toBe('notSent');
    expect(accountsApi.request).not.toHaveBeenCalled();
  });

  it('stops retrying when the session changes between attempts', async () => {
    let isCurrent = true;
    const { accountsApi, deletion } = request();
    accountsApi.request.mockImplementationOnce(() => {
      isCurrent = false;
      return Promise.reject(new AccountsApiError('Offline', null, null, true));
    });

    // The failed attempt may still have reached the server, so this is not `notSent`.
    await expect(deletion.send({}, () => isCurrent)).resolves.toBe('sessionEnded');
    expect(accountsApi.request).toHaveBeenCalledOnce();
  });

  it('gives up after its retries with an error the listener can retry', async () => {
    const unavailable = new AccountsApiError('Unavailable', 503, null, true);
    const { accountsApi, deletion } = request(unavailable, unavailable, unavailable);

    await expect(deletion.send({}, current)).rejects.toMatchObject({
      code: 'account_deletion_failed',
      retryable: true,
    });
    expect(accountsApi.request).toHaveBeenCalledTimes(3);
  });

  it('reports an ended session instead of an error on 401', async () => {
    const { deletion } = request(new AccountsApiError('Unauthorized', 401, null, false));

    await expect(deletion.send({}, current)).resolves.toBe('sessionEnded');
  });

  it('reports an ended session when the token refresh is refused', async () => {
    const { deletion } = request(Object.assign(new Error('Refused'), { code: 'invalid_grant' }));

    await expect(deletion.send({}, current)).resolves.toBe('sessionEnded');
  });

  it('explains that deletion is switched off on 404', async () => {
    const { accountsApi, deletion } = request(new AccountsApiError('Not found', 404, null, false));

    await expect(deletion.send({}, current)).rejects.toMatchObject({
      code: 'account_deletion_unavailable',
      retryable: false,
    });
    expect(accountsApi.request).toHaveBeenCalledOnce();
  });
});
