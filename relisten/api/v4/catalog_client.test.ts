/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => bytes,
}));

vi.mock('expo-file-system', () => ({
  Paths: {
    document: '/documents',
    join: (...parts: string[]) => parts.join('/'),
  },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('@/relisten/events', () => ({ sharedStatsigClient: vi.fn() }));

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { CatalogV4Client } from './catalog_client';
import { encodeV4UuidCatalogId } from './catalog_identity';
import {
  CatalogV4ProtocolError,
  CatalogV4Transport,
  type CatalogV4RequestMetrics,
} from './catalog_transport';
import type {
  V4ArtistCatalogResource,
  V4ShowResource,
  V4SourceResource,
  V4TrackResource,
  V4UuidCatalogPrefix,
} from './wire_types';
import { CatalogQueryState } from '@/relisten/realm/models/v4_catalog';

const requestedUuid = '769b65e5-5d53-4710-8ae3-e6d3d63f576f';
const returnedUuid = '11111111-2222-4333-8444-555555555555';
const metrics: CatalogV4RequestMetrics = {
  bodyBytes: 100,
  downloadMilliseconds: 2,
  parseMilliseconds: 3,
  totalMilliseconds: 7,
};

interface DetailCase {
  name: string;
  prefix: V4UuidCatalogPrefix;
  path: (id: string) => string;
  refresh: (client: CatalogV4Client) => Promise<unknown>;
  payload: (id: string) => unknown;
}

const detailCases: DetailCase[] = [
  {
    name: 'artist catalog',
    prefix: 'artist',
    path: (id) => `/artists/${id}/catalog`,
    refresh: (client) => client.refreshArtistCatalog(requestedUuid),
    payload: (id) => ({ artist: { id } }) as V4ArtistCatalogResource,
  },
  {
    name: 'show',
    prefix: 'show',
    path: (id) => `/shows/${id}`,
    refresh: (client) => client.refreshShow(requestedUuid),
    payload: (id) => ({ id }) as V4ShowResource,
  },
  {
    name: 'source',
    prefix: 'source',
    path: (id) => `/sources/${id}`,
    refresh: (client) => client.refreshSource(requestedUuid),
    payload: (id) => ({ id }) as V4SourceResource,
  },
  {
    name: 'track',
    prefix: 'track',
    path: (id) => `/source-tracks/${id}`,
    refresh: (client) => client.refreshTrack(requestedUuid),
    payload: (id) => ({ id }) as V4TrackResource,
  },
];

describe('CatalogV4Client detail identity validation', () => {
  let directory: string;
  let realm: Realm;
  let transport: CatalogV4Transport;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-v4-client-'));
    realm = new Realm({
      path: join(directory, 'catalog.realm'),
      schema: [CatalogQueryState],
    });
    transport = new CatalogV4Transport({
      apiBase: 'https://catalog.example/api',
      fetch: vi.fn(),
    });
  });

  afterEach(() => {
    if (!realm.isClosed) realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it.each(detailCases)(
    'rejects a mismatched $name before applying or committing its ETag',
    async (detailCase) => {
      const expectedId = encodeV4UuidCatalogId(requestedUuid, detailCase.prefix);
      const mismatchedId = encodeV4UuidCatalogId(returnedUuid, detailCase.prefix);
      const path = detailCase.path(expectedId);
      vi.spyOn(transport, 'getJson').mockResolvedValue({
        status: 'ok',
        data: detailCase.payload(mismatchedId),
        etag: 'W/"wrong-resource"',
        metrics,
      });
      const client = new CatalogV4Client(realm, { transport });

      await expect(detailCase.refresh(client)).rejects.toMatchObject({
        name: CatalogV4ProtocolError.name,
        message: expect.stringContaining(`returned ${mismatchedId} instead of ${expectedId}`),
      });

      const state = realm.objectForPrimaryKey(CatalogQueryState, `GET ${path}`);
      expect(state).toMatchObject({
        hasAppliedData: false,
        retryPending: true,
      });
      expect(state?.etag).toBeNull();
      expect(state?.resultIds).toHaveLength(0);
    }
  );
});
