/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import type {
  AccountScopeCapture,
  AccountScopeSource,
} from '@/relisten/accounts/account_scope_store';
import { CatalogV4Coordinator } from './catalog_coordinator';
import { CatalogV4Transport, type CatalogV4GetResponse } from './catalog_transport';
import { CatalogQueryState } from '@/relisten/realm/models/v4_catalog';

class CatalogTestItem extends Realm.Object<CatalogTestItem> {
  static schema: Realm.ObjectSchema = {
    name: 'CatalogTestItem',
    primaryKey: 'id',
    properties: {
      id: 'string',
      value: 'string',
    },
  };

  id!: string;
  value!: string;
}

interface TestPayload {
  id: string;
  value: string;
}

class MutableAccountScope implements AccountScopeSource {
  private captureValue: AccountScopeCapture = {
    scopeId: 'anonymous',
    userId: null,
    generation: 0,
    nativeSessionId: null,
    isAuthenticated: false,
  };

  subscribe() {
    return () => {};
  }

  getSnapshot = () => this.captureValue;
  capture = () => this.captureValue;
  isCurrent = (capture: AccountScopeCapture) => capture === this.captureValue;

  advance() {
    this.captureValue = {
      ...this.captureValue,
      generation: this.captureValue.generation + 1,
    };
  }
}

const metrics = {
  bodyBytes: 100,
  downloadMilliseconds: 2,
  parseMilliseconds: 3,
  totalMilliseconds: 7,
};

function ok(data: TestPayload, etag: string): CatalogV4GetResponse<TestPayload> {
  return { status: 'ok', data, etag, metrics };
}

function notModified(etag: string): CatalogV4GetResponse<TestPayload> {
  return { status: 'not_modified', etag, metrics };
}

describe('CatalogV4Coordinator', () => {
  let directory: string;
  let realm: Realm;
  let transport: CatalogV4Transport;
  let getJson: ReturnType<typeof vi.spyOn>;
  let accountScope: MutableAccountScope;
  let currentTime: Date;
  let monotonicTime: number;
  let coordinator: CatalogV4Coordinator;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-v4-coordinator-'));
    realm = new Realm({
      path: join(directory, 'catalog.realm'),
      schema: [CatalogQueryState, CatalogTestItem],
    });
    transport = new CatalogV4Transport({
      apiBase: 'https://catalog.example/api',
      fetch: vi.fn(),
    });
    getJson = vi.spyOn(transport, 'getJson');
    accountScope = new MutableAccountScope();
    currentTime = new Date('2026-10-31T12:00:00Z');
    monotonicTime = 100;
    coordinator = new CatalogV4Coordinator(realm, transport, {
      accountScope,
      now: () => currentTime,
      nowMilliseconds: () => monotonicTime,
    });
  });

  afterEach(() => {
    if (!realm.isClosed) realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function item() {
    return realm.objectForPrimaryKey(CatalogTestItem, 'item');
  }

  function queryState() {
    return realm.objectForPrimaryKey(CatalogQueryState, 'test:item');
  }

  function run(
    force = false,
    apply: (data: TestPayload) => string[] = (data) => {
      realm.create(CatalogTestItem, data, Realm.UpdateMode.Modified);
      return [data.id];
    }
  ) {
    const retry = () => run(false, apply);
    return coordinator.refresh<TestPayload>({
      queryKey: 'test:item',
      path: '/test/item',
      force,
      hasLocalData: () => item() !== null,
      apply,
      retry,
    });
  }

  function seedAppliedState(etag = 'W/"old"') {
    realm.write(() => {
      realm.create(CatalogTestItem, { id: 'item', value: 'old' });
      realm.create(CatalogQueryState, {
        key: 'test:item',
        etag,
        hasAppliedData: true,
        lastAppliedAt: new Date('2026-10-31T11:00:00Z'),
        lastCheckedAt: new Date('2026-10-31T11:00:00Z'),
        retryPending: false,
        resultIds: ['item'],
      });
    });
  }

  it('commits the payload, exact result IDs, and ETag together', async () => {
    getJson.mockResolvedValue(ok({ id: 'item', value: 'applied' }, 'W/"new"'));
    monotonicTime = 123;

    const result = await run();

    expect(result).toMatchObject({ status: 'applied', metrics });
    expect(item()?.value).toBe('applied');
    expect(queryState()).toMatchObject({
      etag: 'W/"new"',
      hasAppliedData: true,
      retryPending: false,
      lastAppliedAt: currentTime,
      lastCheckedAt: currentTime,
    });
    expect(queryState()?.resultIds.slice()).toEqual(['item']);
  });

  it('rolls back a failed apply, keeps no validator, and retries on reconnect', async () => {
    getJson
      .mockResolvedValueOnce(ok({ id: 'item', value: 'first' }, 'W/"failed"'))
      .mockResolvedValueOnce(ok({ id: 'item', value: 'retry' }, 'W/"retry"'));
    let failApply = true;
    const apply = (data: TestPayload) => {
      realm.create(CatalogTestItem, data, Realm.UpdateMode.Modified);
      if (failApply) throw new Error('fixture apply failure');
      return [data.id];
    };

    await expect(run(false, apply)).rejects.toThrow('fixture apply failure');
    expect(item()).toBeNull();
    expect(queryState()).toMatchObject({
      etag: null,
      hasAppliedData: false,
      retryPending: true,
    });

    failApply = false;
    await coordinator.onNetworkAvailable();

    expect(item()?.value).toBe('retry');
    expect(queryState()).toMatchObject({
      etag: 'W/"retry"',
      hasAppliedData: true,
      retryPending: false,
    });
  });

  it('accepts 304 only while its matching applied data is still present', async () => {
    seedAppliedState();
    getJson.mockResolvedValue(notModified('W/"old"'));

    const result = await run();

    expect(result.status).toBe('not_modified');
    expect(item()?.value).toBe('old');
    expect(queryState()?.etag).toBe('W/"old"');
    expect(queryState()?.lastCheckedAt).toEqual(currentTime);
  });

  it('refetches unconditionally when local data disappears before a 304 arrives', async () => {
    seedAppliedState();
    let release304!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      release304 = resolve;
    });
    getJson
      .mockImplementationOnce(async () => {
        await responseGate;
        return notModified('W/"old"');
      })
      .mockResolvedValueOnce(ok({ id: 'item', value: 'restored' }, 'W/"restored"'));

    const refresh = run();
    realm.write(() => realm.delete(item()!));
    release304();
    const result = await refresh;

    expect(result.status).toBe('applied');
    expect(item()?.value).toBe('restored');
    expect(queryState()?.etag).toBe('W/"restored"');
  });

  it('uses the 15-minute applied check and lets manual refresh bypass it', async () => {
    seedAppliedState();
    currentTime = new Date('2026-10-31T11:05:00Z');

    const cached = await run();
    expect(cached.status).toBe('fresh');
    expect(item()?.value).toBe('old');
    expect(getJson).not.toHaveBeenCalled();

    getJson.mockResolvedValue(ok({ id: 'item', value: 'manual' }, 'W/"manual"'));
    const refreshed = await run(true);

    expect(refreshed.status).toBe('applied');
    expect(item()?.value).toBe('manual');
    expect(queryState()?.etag).toBe('W/"manual"');
  });

  it('discards an older same-query completion after a forced refresh wins', async () => {
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    getJson
      .mockImplementationOnce(async () => {
        await oldGate;
        return ok({ id: 'item', value: 'old response' }, 'W/"old-response"');
      })
      .mockResolvedValueOnce(ok({ id: 'item', value: 'new response' }, 'W/"new-response"'));

    const oldRefresh = run();
    const newRefresh = run(true);
    await expect(newRefresh).resolves.toMatchObject({ status: 'applied' });
    releaseOld();
    await expect(oldRefresh).resolves.toEqual({ status: 'discarded' });

    expect(item()?.value).toBe('new response');
    expect(queryState()?.etag).toBe('W/"new-response"');
  });

  it('does not let a superseded failure mark a newer successful result for retry', async () => {
    let rejectOld!: (error: Error) => void;
    const oldResponse = new Promise<CatalogV4GetResponse<TestPayload>>((_, reject) => {
      rejectOld = reject;
    });
    getJson
      .mockImplementationOnce(() => oldResponse)
      .mockResolvedValueOnce(ok({ id: 'item', value: 'new response' }, 'W/"new-response"'));

    const oldRefresh = run();
    await expect(run(true)).resolves.toMatchObject({ status: 'applied' });
    rejectOld(new Error('late transport failure'));
    await expect(oldRefresh).resolves.toEqual({ status: 'discarded' });

    expect(item()?.value).toBe('new response');
    expect(queryState()).toMatchObject({
      etag: 'W/"new-response"',
      retryPending: false,
    });
  });

  it('discards a completion from the previous transport generation', async () => {
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    getJson.mockImplementationOnce(async () => {
      await oldGate;
      return ok({ id: 'item', value: 'old transport' }, 'W/"old-transport"');
    });
    const oldRefresh = run();

    const replacement = new CatalogV4Transport({
      apiBase: 'https://replacement.example/api',
      fetch: vi.fn(),
    });
    vi.spyOn(replacement, 'getJson').mockResolvedValue(
      ok({ id: 'item', value: 'replacement' }, 'W/"replacement"')
    );
    coordinator.replaceTransport(replacement);
    await expect(run()).resolves.toMatchObject({ status: 'applied' });
    releaseOld();
    await expect(oldRefresh).resolves.toEqual({ status: 'discarded' });

    expect(item()?.value).toBe('replacement');
    expect(queryState()?.etag).toBe('W/"replacement"');
  });

  it('invalidates persisted freshness and validators when the transport changes', async () => {
    seedAppliedState();
    currentTime = new Date('2026-10-31T11:05:00Z');
    const replacement = new CatalogV4Transport({
      apiBase: 'https://replacement.example/api',
      fetch: vi.fn(),
    });
    const replacementGetJson = vi
      .spyOn(replacement, 'getJson')
      .mockResolvedValue(ok({ id: 'item', value: 'replacement' }, 'W/"replacement"'));

    coordinator.replaceTransport(replacement);
    expect(queryState()).toMatchObject({ etag: null, lastCheckedAt: null });

    await expect(run()).resolves.toMatchObject({ status: 'applied' });
    expect(replacementGetJson).toHaveBeenCalledWith('/test/item', undefined);
    expect(item()?.value).toBe('replacement');
  });

  it('discards an account-stale completion and retries it under the current scope', async () => {
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    getJson
      .mockImplementationOnce(async () => {
        await responseGate;
        return ok({ id: 'item', value: 'stale account' }, 'W/"stale-account"');
      })
      .mockResolvedValueOnce(ok({ id: 'item', value: 'current account' }, 'W/"current-account"'));

    const refresh = run();
    accountScope.advance();
    releaseResponse();

    await expect(refresh).resolves.toEqual({ status: 'discarded' });
    await vi.waitFor(() => expect(item()?.value).toBe('current account'));
    expect(queryState()).toMatchObject({
      etag: 'W/"current-account"',
      retryPending: false,
    });
  });
});
