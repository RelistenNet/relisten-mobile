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
import { CatalogTransport } from '@/relisten/api/catalog/transport';
import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { TrackResource } from '@/relisten/api/catalog/resources';
import { NetworkBackedBehavior, retryFailedRequests } from './network_backed_behavior';
import { EmittableValueStream } from './value_streams';

const uuid = '00000000-0000-4000-8000-000000000001';
const id = encodeUuidCatalogId(uuid, 'track');

class Item extends Realm.Object<Item> {
  static schema: Realm.ObjectSchema = {
    name: 'Item',
    primaryKey: 'id',
    properties: { id: 'string', title: 'string' },
  };

  id!: string;

  title!: string;
}

class TrackRepository extends NetworkBackedBehavior<Realm.Results<Item>, TrackResource> {
  failApply = false;
  applyCount = 0;

  constructor(realm: Realm) {
    super(realm);
  }

  createLocalUpdatingResults() {
    return new EmittableValueStream(this.realm.objects(Item));
  }

  fetchFromApi(api: RelistenApiClient, force: boolean) {
    return api.track(uuid, { force });
  }

  isLocalDataShowable(data: Realm.Results<Item>) {
    return data.length > 0;
  }

  upsert(_data: Realm.Results<Item>, track: TrackResource) {
    this.applyCount++;
    this.realm.create(Item, { id: track.id, title: track.title }, Realm.UpdateMode.Modified);
    if (this.failApply) {
      throw new Error('Apply failed after writing a row.');
    }
    return [track.id];
  }
}

function body(title = 'Imported title', etag = '"current"') {
  const track: TrackResource = {
    id,
    source_id: encodeUuidCatalogId(uuid, 'source'),
    source_set_id: encodeUuidCatalogId(uuid, 'source_set'),
    show_id: encodeUuidCatalogId(uuid, 'show'),
    artist_id: encodeUuidCatalogId(uuid, 'artist'),
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
      schema: [Item],
    });
    fetch = vi.fn();
    api = new RelistenApiClient({
      transport: new CatalogTransport({ apiBase: 'https://catalog.test/api', fetch }),
    });
    repository = new TrackRepository(realm);
  });

  afterEach(() => {
    realm.close();
    rmSync(directory, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('keeps fetching separate from Realm application and accepts bodies without ETags', async () => {
    fetch.mockImplementation(
      async () => new Response(JSON.stringify({ id, title: 'No validator' }))
    );
    const response = await api.track(uuid);
    expect(response.data?.title).toBe('No validator');
    expect(realm.objects(Item)).toHaveLength(0);
    const executor = repository.sharedExecutor(api);
    await executor.refresh();
    expect(executor.currentResults().data[0].title).toBe('No validator');
    expect(repository.applyCount).toBe(1);
    executor.tearDown();
  });

  it('rolls back failed application and retries the mounted behavior on reconnect', async () => {
    fetch.mockImplementation(async () => body());
    const executor = repository.sharedExecutor(api);
    await executor.refresh();
    repository.failApply = true;
    fetch.mockImplementation(async () => body('Correction'));
    await executor.refresh(true);
    expect(executor.currentResults().errors?.[0].message).toContain('Apply failed');
    expect(realm.objectForPrimaryKey(Item, id)?.title).toBe('Imported title');
    repository.failApply = false;
    await retryFailedRequests(realm);
    expect(realm.objectForPrimaryKey(Item, id)?.title).toBe('Correction');
    expect(executor.currentResults().errors).toBeUndefined();
    executor.tearDown();
  });

  it('deduplicates overlapping reads and applies their shared response once', async () => {
    let finish!: (response: Response) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const first = repository.sharedExecutor(api);
    const other = new TrackRepository(realm);
    const second = other.sharedExecutor(api);
    const requests = [first.refresh(), second.refresh()];
    finish(body());
    await Promise.all(requests);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(repository.applyCount + other.applyCount).toBe(1);
    expect(realm.objectForPrimaryKey(Item, id)?.title).toBe('Imported title');
    first.tearDown();
    second.tearDown();
  });

  it('applies a shared request even when an imperative caller started it', async () => {
    let finish!: (response: Response) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const imperative = api.track(uuid);
    const executor = repository.sharedExecutor(api);
    const applying = executor.refresh();
    finish(body('Shared body'));
    await Promise.all([imperative, applying]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(repository.applyCount).toBe(1);
    expect(realm.objectForPrimaryKey(Item, id)?.title).toBe('Shared body');
    executor.tearDown();
  });

  it.each([false, true])(
    'ignores a superseded response across repository instances (failure=%s)',
    async (fails) => {
      let finish!: (response: Response) => void;
      fetch.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          })
      );
      const first = repository.sharedExecutor(api);
      const older = first.refresh();
      fetch.mockImplementationOnce(async () => body('New value'));
      const second = new TrackRepository(realm).sharedExecutor(api);
      await second.refresh(true);
      // Permanent failures exercise fencing without spending time in the retry policy.
      finish(fails ? new Response('Missing', { status: 404 }) : body('Old value'));
      await older;
      expect(realm.objectForPrimaryKey(Item, id)?.title).toBe('New value');
      expect(first.currentResults().errors).toBeUndefined();
      first.tearDown();
      second.tearDown();
    }
  );

  it('keeps the latest failure when an older success finishes, then recovers', async () => {
    let finish!: (response: Response) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const executor = repository.sharedExecutor(api);
    const older = executor.refresh();
    fetch.mockImplementationOnce(async () => new Response('Missing', { status: 404 }));
    await executor.refresh(true);
    finish(body('Old value'));
    await older;
    expect(executor.currentResults().errors?.[0].message).toContain('404');
    expect(executor.currentResults().isNetworkLoading).toBe(false);
    expect(realm.objects(Item)).toHaveLength(0);
    fetch.mockImplementationOnce(async () => body('Recovered'));
    await retryFailedRequests(realm);
    expect(executor.currentResults().data[0].title).toBe('Recovered');
    expect(executor.currentResults().errors).toBeUndefined();
    executor.tearDown();
  });

  it('keeps loading while a newer forced request remains in flight', async () => {
    const pending: ((response: Response) => void)[] = [];
    fetch.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)));
    const executor = repository.sharedExecutor(api);
    const older = executor.refresh();
    const newer = executor.refresh(true);
    pending[0](body('Old'));
    await older;
    expect(executor.currentResults().isNetworkLoading).toBe(true);
    pending[1](body('New'));
    await newer;
    expect(executor.currentResults().isNetworkLoading).toBe(false);
    expect(executor.currentResults().data[0].title).toBe('New');
    executor.tearDown();
  });

  it('joins an in-flight manual refresh and applies its body', async () => {
    fetch.mockImplementationOnce(async () => body());
    const executor = repository.sharedExecutor(api);
    await executor.refresh();
    let finish!: (response: Response) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    );
    const manual = executor.refresh(true);
    const ordinary = executor.refresh();
    expect(executor.currentResults().isNetworkLoading).toBe(true);
    finish(body('Manual result'));
    await Promise.all([manual, ordinary]);
    expect(executor.currentResults().data[0].title).toBe('Manual result');
    expect(repository.applyCount).toBe(2);
    executor.tearDown();
  });

  it('retries transient GET failures without a connectivity transition', async () => {
    fetch.mockImplementationOnce(async () => new Response('Temporary', { status: 503 }));
    fetch.mockImplementationOnce(async () => body('Recovered'));
    const executor = repository.sharedExecutor(api);
    await executor.refresh();
    expect(executor.currentResults().data[0].title).toBe('Recovered');
    expect(executor.currentResults().errors).toBeUndefined();
    executor.tearDown();
  });

  it('does not retry a failed behavior after it is unmounted', async () => {
    fetch.mockImplementation(async () => new Response('Missing', { status: 404 }));
    const executor = repository.sharedExecutor(api);
    await executor.refresh();
    executor.tearDown();
    await retryFailedRequests(realm);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
