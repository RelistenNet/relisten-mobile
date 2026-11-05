/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.hoisted(() => {
  vi.stubGlobal('__DEV__', true);
});
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));
vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { RelistenApiClient } from '@/relisten/api/client';
import { CatalogV4Transport } from '@/relisten/api/v4/catalog_transport';
import { encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import type { V4TrackResource } from '@/relisten/api/v4/wire_types';
import { CatalogQueryState } from './models/v4_catalog';
import { NetworkBackedBehavior, retryCatalogRequests } from './network_backed_behavior';
import { EmittableValueStream } from './value_streams';

const uuid = '00000000-0000-4000-8000-000000000001';
const id = encodeV4UuidCatalogId(uuid, 'track');
const queryKey = `GET /source-tracks/${id}`;

class Item extends Realm.Object<Item> {
  static schema: Realm.ObjectSchema = {
    name: 'Item',
    primaryKey: 'id',
    properties: { id: 'string', title: 'string' },
  };

  id!: string;

  title!: string;
}

class TrackRepository extends NetworkBackedBehavior<Realm.Results<Item>, V4TrackResource> {
  failApply = false;

  constructor(realm: Realm) {
    super(realm);
  }

  get queryKey() {
    return queryKey;
  }

  createLocalUpdatingResults() {
    return new EmittableValueStream(this.realm.objects(Item));
  }

  fetchFromApi(api: RelistenApiClient, _force: boolean, etag?: string) {
    return api.track(uuid, { etag });
  }

  isLocalDataShowable(data: Realm.Results<Item>) {
    return data.length > 0;
  }

  hasLocalData(data: Realm.Results<Item>) {
    return data.length > 0;
  }

  upsert(_data: Realm.Results<Item>, track: V4TrackResource) {
    this.realm.create(Item, { id: track.id, title: track.title }, Realm.UpdateMode.Modified);
    if (this.failApply) {
      throw new Error('Apply failed after writing a row.');
    }
    return [track.id];
  }
}

function body(title = 'Imported title', etag = '"current"') {
  const track: V4TrackResource = {
    id,
    source_id: encodeV4UuidCatalogId(uuid, 'source'),
    source_set_id: encodeV4UuidCatalogId(uuid, 'source_set'),
    show_id: encodeV4UuidCatalogId(uuid, 'show'),
    artist_id: encodeV4UuidCatalogId(uuid, 'artist'),
    track_position: 1,
    duration: 300,
    title,
    slug: 'track',
    mp3_url: 'https://example.com/track.mp3',
    mp3_md5: null,
    flac_url: null,
    flac_md5: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    normalization: { state: 'unavailable', reason: 'not_interpreted', parts: [] },
  };
  return new Response(JSON.stringify(track), { headers: { etag } });
}

function unchanged(etag = '"current"') {
  return new Response(null, { status: 304, headers: { etag } });
}

describe('repository request execution', () => {
  let directory: string;
  let realm: Realm;
  let fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
  let repository: TrackRepository;
  let api: RelistenApiClient;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    directory = mkdtempSync(join(tmpdir(), 'relisten-repository-'));
    realm = new Realm({
      path: join(directory, 'catalog.realm'),
      schema: [Item, CatalogQueryState],
    });
    fetch = vi.fn();
    api = new RelistenApiClient({
      transport: new CatalogV4Transport({ apiBase: 'https://catalog.test/api', fetch }),
    });
    repository = new TrackRepository(realm);
  });

  afterEach(() => {
    realm.close();
    rmSync(directory, { recursive: true, force: true });
    vi.useRealTimers();
  });

  function state() {
    return realm.objectForPrimaryKey(CatalogQueryState, queryKey)!;
  }

  it('returns an API payload without storage, then lets the repository commit its payload and ETag together', async () => {
    fetch.mockImplementation(async () => body());
    const response = await api.track(uuid);
    expect(response.data?.title).toBe('Imported title');
    expect(realm.objects(Item)).toHaveLength(0);

    const executor = repository.sharedExecutor(api);
    await executor.refresh();
    expect(executor.currentResults().data[0].title).toBe('Imported title');
    expect([...state().resultIds]).toEqual([id]);
    expect(state().etag).toBe('"current"');
    expect(state().retryPending).toBe(false);
  });

  it('rolls back failed application and preserves data and validator until reconnect repairs it', async () => {
    fetch.mockImplementation(async () => body());
    const executor = repository.sharedExecutor(api);
    await executor.refresh();

    repository.failApply = true;
    fetch.mockImplementation(async (_input, init) => {
      expect(new Headers(init?.headers).has('If-None-Match')).toBe(false);
      return body('Correction', '"corrected"');
    });
    await executor.refresh(true);
    expect(executor.currentResults().errors?.[0].message).toContain('Apply failed');
    expect(realm.objectForPrimaryKey(Item, id)?.title).toBe('Imported title');
    expect(state().etag).toBe('"current"');
    expect(state().retryPending).toBe(true);

    repository.failApply = false;
    await retryCatalogRequests(realm);
    expect(realm.objectForPrimaryKey(Item, id)?.title).toBe('Correction');
    expect(state().etag).toBe('"corrected"');
    expect(executor.currentResults().errors).toBeUndefined();
  });

  it('reuses fresh data and expired validators, while manual refresh always requests a body', async () => {
    fetch.mockImplementation(async () => body());
    const executor = repository.sharedExecutor(api);
    await executor.refresh();
    await executor.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(Date.now() + 15 * 60 * 1000));
    fetch.mockImplementation(async (_input, init) => {
      expect(new Headers(init?.headers).get('If-None-Match')).toBe('"current"');
      return unchanged();
    });
    await executor.refresh();
    fetch.mockImplementation(async (_input, init) => {
      expect(new Headers(init?.headers).has('If-None-Match')).toBe(false);
      return body('Manually refreshed');
    });
    await executor.refresh(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(executor.currentResults().data[0].title).toBe('Manually refreshed');
  });

  it('requests a body if local data disappears while a conditional request is in flight', async () => {
    fetch.mockImplementationOnce(async () => body());
    const executor = repository.sharedExecutor(api);
    await executor.refresh();
    vi.setSystemTime(new Date(Date.now() + 15 * 60 * 1000));
    let finish: ((response: Response) => void) | undefined;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const pending = executor.refresh();
    await vi.waitFor(() => expect(finish).toBeDefined());
    realm.write(() => realm.delete(realm.objects(Item)));
    fetch.mockImplementationOnce(async (_input, init) => {
      expect(new Headers(init?.headers).has('If-None-Match')).toBe(false);
      return body('Restored');
    });
    finish!(unchanged());
    await pending;
    expect(executor.currentResults().data[0].title).toBe('Restored');

    realm.write(() => realm.delete(realm.objects(Item)));
    fetch.mockImplementationOnce(async (_input, init) => {
      expect(new Headers(init?.headers).has('If-None-Match')).toBe(false);
      return body('Restored missing root');
    });
    await executor.refresh();
    expect(executor.currentResults().data[0].title).toBe('Restored missing root');
  });

  it.each([false, true])('ignores a superseded completion, including failure=%s', async (fails) => {
    let finish: ((response: Response) => void) | undefined;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const older = repository.sharedExecutor(api).refresh();
    await vi.waitFor(() => expect(finish).toBeDefined());
    fetch.mockImplementationOnce(async () => body('New value', '"new"'));
    const newerExecutor = new TrackRepository(realm).sharedExecutor(api);
    await newerExecutor.refresh(true);
    finish!(fails ? new Response('Unavailable', { status: 503 }) : body('Old value', '"old"'));
    await older;
    expect(newerExecutor.currentResults().data[0].title).toBe('New value');
    expect(state().etag).toBe('"new"');
    expect(state().retryPending).toBe(false);
  });

  it('coalesces ordinary same-query reads across repository instances', async () => {
    let finish: ((response: Response) => void) | undefined;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const first = repository.sharedExecutor(api).refresh();
    const second = new TrackRepository(realm).sharedExecutor(api).refresh();
    await vi.waitFor(() => expect(finish).toBeDefined());
    finish!(body());
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(state().hasAppliedData).toBe(true);
  });
});
