/// <reference types="node" />
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerWarn, ensureCatalogArtist } = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  ensureCatalogArtist: vi.fn(),
}));

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));
vi.mock('expo-file-system', () => ({
  Paths: {
    document: '/documents',
    join: (...parts: string[]) => parts.join('/'),
  },
}));
vi.mock('@/relisten/events', () => ({ sharedStatsigClient: vi.fn() }));
vi.mock('@/relisten/api/client', () => ({ RelistenApiClient: class {} }));
vi.mock('@/relisten/realm/models/artist_repo', () => ({ ensureCatalogArtist }));
vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ warn: loggerWarn }) },
}));

import type { RelistenApiClient } from '@/relisten/api/client';
import type { CatalogReferenceRequest } from '@/relisten/api/catalog/resolve';
import { Artist } from '@/relisten/realm/models/artist';
import { UserFavorite } from '@/relisten/realm/models/library';
import {
  Popularity,
  PopularityWindow,
  PopularityWindows,
} from '@/relisten/realm/models/popularity';
import {
  ArtistVenue,
  CatalogQueryState,
  NormalizedSong,
  NormalizedVenue,
  NormalizedVenueName,
} from '@/relisten/realm/models/catalog';
import { FavoriteMetadataHydrator } from './favorite_metadata_hydrator';
import type { FavoriteRepository } from './favorite_repository';

const capture = { scopeId: 'scope-a', generation: 1 };
const artistUuid = '77a58ff9-2e01-c59c-b8eb-cff106049b72';

describe('FavoriteMetadataHydrator canonical favorites', () => {
  let directory: string;
  let realm: Realm;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-favorite-hydrator-'));
    realm = new Realm({
      path: join(directory, 'favorites.realm'),
      schema: [
        UserFavorite,
        Artist,
        Popularity,
        PopularityWindows,
        PopularityWindow,
        { name: 'Show', primaryKey: 'uuid', properties: { uuid: 'string' } },
        {
          name: 'SourceTrack',
          primaryKey: 'uuid',
          properties: { uuid: 'string', artist: 'Artist?' },
        },
        NormalizedSong,
        NormalizedVenueName,
        NormalizedVenue,
        ArtistVenue,
        CatalogQueryState,
      ],
    });
  });

  afterEach(() => {
    if (!realm.isClosed) {
      realm.close();
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it('applies available and redirected patches while retaining retired favorites', async () => {
    const now = new Date('2026-11-01T12:00:00Z');
    realm.write(() => {
      for (const targetId of ['venue_fp4h900f', 'venue_0abc5678', 'venue_0abc1234']) {
        realm.create(UserFavorite, {
          favoriteId: `favorite_${targetId}`,
          scopeId: capture.scopeId,
          targetKind: 'venue',
          targetId,
          acknowledgedPresent: true,
          effectivePresent: true,
          lastLocalSequence: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      realm.create(UserFavorite, {
        favoriteId: 'favorite_song_hzk4tx63',
        scopeId: capture.scopeId,
        targetKind: 'song',
        targetId: 'song_hzk4tx63',
        acknowledgedPresent: true,
        effectivePresent: true,
        lastLocalSequence: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    const resolveCatalogReferences = vi.fn(async (references: CatalogReferenceRequest[]) => {
      expect(references).toHaveLength(4);
      return {
        type: 3,
        data: {
          references: [
            {
              kind: 'venue' as const,
              scheme: 'v4' as const,
              id: 'venue_fp4h900f',
              artist_id: null,
              availability: 'available' as const,
              target: { kind: 'venue' as const, id: 'venue_fp4h900f' },
              reason: null,
            },
            {
              kind: 'venue' as const,
              scheme: 'v4' as const,
              id: 'venue_0abc5678',
              artist_id: null,
              availability: 'redirected' as const,
              target: { kind: 'venue' as const, id: 'venue_fp4h900f' },
              reason: null,
            },
            {
              kind: 'venue' as const,
              scheme: 'v4' as const,
              id: 'venue_0abc1234',
              artist_id: null,
              availability: 'retired' as const,
              target: null,
              reason: null,
            },
            {
              kind: 'song' as const,
              scheme: 'v4' as const,
              id: 'song_hzk4tx63',
              artist_id: null,
              availability: 'available' as const,
              target: { kind: 'song' as const, id: 'song_hzk4tx63' },
              reason: null,
            },
          ],
          entities: {
            artists: [],
            years: [],
            tours: [],
            imported_venues: [],
            imported_songs: [],
            artist_venues: [],
            shows: [],
            sources: [],
            source_sets: [],
            tracks: [],
            venues: [
              {
                id: 'venue_fp4h900f' as const,
                global_show_count: 176,
                name: 'Red Rocks Amphitheatre',
                kind: 'site',
                parent_id: null,
                city: 'Morrison',
                region: 'CO',
                country: 'US',
                latitude: null,
                longitude: null,
                coordinate_precision: null,
                names: [{ name: 'Red Rocks Amphitheatre', kind: 'official' }],
              },
            ],
            songs: [
              {
                id: 'song_hzk4tx63' as const,
                artist_id: 'artist_3qmp7zjbg1rpebhtyfy43096vj' as const,
                name: 'A Voice From On High',
                kind: 'song' as const,
                slug: 'a-voice-from-on-high',
                original_artist: 'Traditional',
                aliases: [],
                matched_track_count: 6,
                matched_show_count: 5,
              },
            ],
          },
        },
      };
    });
    ensureCatalogArtist.mockImplementation(async () => {
      realm.write(() =>
        realm.create(Artist, {
          uuid: artistUuid,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          musicbrainzId: '',
          name: 'Grateful Dead',
          featured: 1,
          slug: 'grateful-dead',
          sortName: 'Grateful Dead',
          featuresRaw: '{}',
          upstreamSourcesRaw: '[]',
          showCount: 0,
          sourceCount: 0,
          isFavorite: false,
        })
      );
    });
    const catalogApi = {
      resolveCatalogReferences,
    } as unknown as RelistenApiClient;
    const repository = {
      realm,
      isCaptureCurrent: (value: typeof capture) => value === capture,
      favoriteForTarget: (scopeId: string, target: { kind: string; id: string }) =>
        realm
          .objects(UserFavorite)
          .filtered(
            'scopeId == $0 AND targetKind == $1 AND targetId == $2',
            scopeId,
            target.kind,
            target.id
          )[0],
    } as unknown as FavoriteRepository;

    await new FavoriteMetadataHydrator(repository, catalogApi).hydrateMissing(capture);

    const requestedReferences = resolveCatalogReferences.mock.calls[0][0];
    expect(new Set(requestedReferences.map((reference) => reference.id))).toEqual(
      new Set(['venue_fp4h900f', 'venue_0abc5678', 'venue_0abc1234', 'song_hzk4tx63'])
    );
    expect(loggerWarn).not.toHaveBeenCalled();
    expect(realm.objectForPrimaryKey(NormalizedVenue, 'venue_fp4h900f')?.name).toBe(
      'Red Rocks Amphitheatre'
    );
    expect(realm.objectForPrimaryKey(NormalizedSong, 'song_hzk4tx63')?.name).toBe(
      'A Voice From On High'
    );
    expect(realm.objects(UserFavorite)).toHaveLength(4);
  });
});
