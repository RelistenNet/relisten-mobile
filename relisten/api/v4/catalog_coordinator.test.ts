/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

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

const metrics = {
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
  let currentTime: Date;
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
    currentTime = new Date('2026-10-31T12:00:00Z');
    coordinator = new CatalogV4Coordinator(realm, transport, {
      now: () => currentTime,
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
    return coordinator.refresh<TestPayload>({
      queryKey: 'test:item',
      path: '/test/item',
      force,
      hasLocalData: () => item() !== null,
      apply,
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

    await run();

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

    await run();

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
    await refresh;

    expect(item()?.value).toBe('restored');
    expect(queryState()?.etag).toBe('W/"restored"');
  });

  it('uses the 15-minute applied check and lets manual refresh bypass it', async () => {
    seedAppliedState();
    currentTime = new Date('2026-10-31T11:05:00Z');

    await run();
    expect(item()?.value).toBe('old');
    expect(getJson).not.toHaveBeenCalled();

    getJson.mockResolvedValue(ok({ id: 'item', value: 'manual' }, 'W/"manual"'));
    await run(true);

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
    await newRefresh;
    releaseOld();
    await oldRefresh;

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
    await run(true);
    rejectOld(new Error('late transport failure'));
    await oldRefresh;

    expect(item()?.value).toBe('new response');
    expect(queryState()).toMatchObject({
      etag: 'W/"new-response"',
      retryPending: false,
    });
  });
});
