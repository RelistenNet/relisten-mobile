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
import { CatalogV4ProtocolError, CatalogV4Transport } from './catalog_transport';
import type {
  V4ArtistFeaturesResource,
  V4ArtistResource,
  V4ShowResource,
  V4SourceResource,
  V4TrackResource,
  V4YearResource,
  V4YearWithShowsResource,
} from './wire_types';
import { Artist } from '@/relisten/realm/models/artist';
import {
  Popularity,
  PopularityWindow,
  PopularityWindows,
} from '@/relisten/realm/models/popularity';
import { CatalogQueryState } from '@/relisten/realm/models/v4_catalog';

const requestedUuid = '769b65e5-5d53-4710-8ae3-e6d3d63f576f';
const returnedUuid = '11111111-2222-4333-8444-555555555555';
const metrics = {
  downloadMilliseconds: 2,
  parseMilliseconds: 3,
  totalMilliseconds: 7,
};

interface RouteIdentityCase {
  name: string;
  mismatchedId: string;
  path: string;
  refresh: (client: CatalogV4Client) => Promise<unknown>;
  payload: (id: string) => unknown;
}

const requestedArtistId = encodeV4UuidCatalogId(requestedUuid, 'artist');
const returnedArtistId = encodeV4UuidCatalogId(returnedUuid, 'artist');
const requestedYearId = encodeV4UuidCatalogId(requestedUuid, 'year');
const returnedYearId = encodeV4UuidCatalogId(returnedUuid, 'year');
const artistListPath = '/artists?include_autocreated=true';
const artistYearsPath = `/artists/${requestedArtistId}/years`;
const selectedYearPath = `${artistYearsPath}/${requestedYearId}`;
const sourceTrackSchema: Realm.ObjectSchema = {
  name: 'SourceTrack',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    artist: 'Artist?',
  },
};

const artistFeatures: V4ArtistFeaturesResource = {
  descriptions: false,
  eras: false,
  multiple_sources: false,
  reviews: false,
  ratings: false,
  tours: false,
  taper_notes: false,
  source_information: false,
  sets: false,
  per_show_venues: false,
  per_source_venues: false,
  venue_coords: false,
  songs: false,
  years: true,
  track_md5s: false,
  review_titles: false,
  jam_charts: false,
  setlist_data_incomplete: false,
  track_names: true,
  venue_past_names: false,
  reviews_have_ratings: false,
  track_durations: true,
  can_have_flac: true,
  normalization: true,
};

function artistResource(): V4ArtistResource {
  return {
    id: requestedArtistId,
    name: 'Requested Artist',
    slug: 'requested-artist',
    sort_name: 'Requested Artist',
    musicbrainz_id: null,
    featured: 0,
    show_count: 1,
    source_count: 1,
    created_at: '2026-10-31T12:00:00.000Z',
    updated_at: '2026-10-31T12:00:00.000Z',
    features: artistFeatures,
    upstream_sources: [],
  };
}

function seedRequestedArtist(realm: Realm) {
  realm.create(Artist, {
    uuid: requestedUuid,
    createdAt: new Date('2026-10-31T12:00:00.000Z'),
    updatedAt: new Date('2026-10-31T12:00:00.000Z'),
    musicbrainzId: '',
    name: 'Requested Artist',
    featured: 0,
    slug: 'requested-artist',
    sortName: 'Requested Artist',
    featuresRaw: JSON.stringify(artistFeatures),
    upstreamSourcesRaw: '[]',
    showCount: 1,
    sourceCount: 1,
  });
}

const routeIdentityCases: RouteIdentityCase[] = [
  {
    name: 'artist years parent',
    mismatchedId: returnedArtistId,
    path: artistYearsPath,
    refresh: (client) => client.refreshArtistYears(requestedUuid),
    payload: (id) => [{ artist_id: id }] as V4YearResource[],
  },
  {
    name: 'selected year',
    mismatchedId: returnedYearId,
    path: selectedYearPath,
    refresh: (client) => client.refreshYear(requestedUuid, requestedUuid),
    payload: (id) =>
      ({ id, artist_id: requestedArtistId, shows: [] }) as unknown as V4YearWithShowsResource,
  },
  {
    name: 'selected year parent',
    mismatchedId: returnedArtistId,
    path: selectedYearPath,
    refresh: (client) => client.refreshYear(requestedUuid, requestedUuid),
    payload: (id) =>
      ({
        id: requestedYearId,
        artist_id: id,
        shows: [],
      }) as unknown as V4YearWithShowsResource,
  },
  {
    name: 'show',
    mismatchedId: encodeV4UuidCatalogId(returnedUuid, 'show'),
    path: `/shows/${encodeV4UuidCatalogId(requestedUuid, 'show')}`,
    refresh: (client) => client.refreshShow(requestedUuid),
    payload: (id) => ({ id }) as V4ShowResource,
  },
  {
    name: 'source',
    mismatchedId: encodeV4UuidCatalogId(returnedUuid, 'source'),
    path: `/sources/${encodeV4UuidCatalogId(requestedUuid, 'source')}`,
    refresh: (client) => client.refreshSource(requestedUuid),
    payload: (id) => ({ id }) as V4SourceResource,
  },
  {
    name: 'track',
    mismatchedId: encodeV4UuidCatalogId(returnedUuid, 'track'),
    path: `/source-tracks/${encodeV4UuidCatalogId(requestedUuid, 'track')}`,
    refresh: (client) => client.refreshTrack(requestedUuid),
    payload: (id) => ({ id }) as V4TrackResource,
  },
];

describe('CatalogV4Client route identity validation', () => {
  let directory: string;
  let realm: Realm;
  let transport: CatalogV4Transport;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-v4-client-'));
    realm = new Realm({
      path: join(directory, 'catalog.realm'),
      schema: [
        Artist,
        Popularity,
        PopularityWindows,
        PopularityWindow,
        sourceTrackSchema,
        CatalogQueryState,
      ],
    });
    realm.write(() => seedRequestedArtist(realm));
    transport = new CatalogV4Transport({
      apiBase: 'https://catalog.example/api',
      fetch: vi.fn(),
    });
  });

  afterEach(() => {
    if (!realm.isClosed) realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it.each(routeIdentityCases)(
    'rejects a mismatched $name before applying or committing its ETag',
    async (routeCase) => {
      vi.spyOn(transport, 'getJson').mockResolvedValue({
        status: 'ok',
        data: routeCase.payload(routeCase.mismatchedId),
        etag: 'W/"wrong-resource"',
        metrics,
      });
      const client = new CatalogV4Client(realm, transport);

      await expect(routeCase.refresh(client)).rejects.toBeInstanceOf(CatalogV4ProtocolError);

      const state = realm.objectForPrimaryKey(CatalogQueryState, `GET ${routeCase.path}`);
      expect(state?.etag ?? null).toBeNull();
    }
  );

  it('uses the granular years routes without requesting an artist catalog', async () => {
    const stopped = new Error('stop before apply');
    const getJson = vi.spyOn(transport, 'getJson').mockRejectedValue(stopped);
    const client = new CatalogV4Client(realm, transport);

    await expect(client.refreshArtistYears(requestedUuid)).rejects.toBe(stopped);
    await expect(client.refreshYear(requestedUuid, requestedUuid)).rejects.toBe(stopped);

    expect(getJson.mock.calls.map(([path]) => path)).toEqual([artistYearsPath, selectedYearPath]);
  });

  it.each([
    {
      name: 'artist years',
      detailPath: artistYearsPath,
      refresh: (client: CatalogV4Client) => client.refreshArtistYears(requestedUuid),
    },
    {
      name: 'selected year',
      detailPath: selectedYearPath,
      refresh: (client: CatalogV4Client) => client.refreshYear(requestedUuid, requestedUuid),
    },
  ])('applies a missing artist before requesting $name', async ({ detailPath, refresh }) => {
    realm.write(() => realm.delete(realm.objectForPrimaryKey(Artist, requestedUuid)!));
    const stopped = new Error('stop after detail request');
    const getJson = vi.spyOn(transport, 'getJson').mockImplementation(async (path) => {
      if (path === artistListPath) {
        return {
          status: 'ok',
          data: [artistResource()],
          etag: 'W/"artists"',
          metrics,
        };
      }

      expect(path).toBe(detailPath);
      expect(realm.objectForPrimaryKey(Artist, requestedUuid)?.name).toBe('Requested Artist');
      throw stopped;
    });
    const client = new CatalogV4Client(realm, transport);

    await expect(refresh(client)).rejects.toBe(stopped);

    expect(getJson.mock.calls.map(([path]) => path)).toEqual([artistListPath, detailPath]);
    expect(realm.objectForPrimaryKey(CatalogQueryState, `GET ${artistListPath}`)?.etag).toBe(
      'W/"artists"'
    );
  });
});
