/// <reference types="node" />
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import type { ReactElement } from 'react';
import type { NetworkBackedResults } from './network_backed_results';
import { LibraryIndex } from './library_index';
import { CatalogIdentity, CatalogRedirect, applyCatalogResolutions } from './catalog_identity';
import { OfflineAvailabilityProjection } from '@/relisten/library/offline_availability_projection';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system', () => ({
  Paths: {
    document: '/documents',
    join: (...parts: string[]) => parts.join('/'),
  },
}));
vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));
vi.mock('@/relisten/events', () => ({ sharedStatsigClient: vi.fn() }));
vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.hoisted(() => {
  vi.stubGlobal('__DEV__', true);
});
vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, View: 'View' }));
vi.mock('@/relisten/api/context', () => ({ useRelistenApi: () => ({ apiClient: null }) }));
vi.mock('@/relisten/util/netinfo', () => ({ useShouldMakeNetworkRequests: () => true }));
const hookRealm = vi.hoisted(() => ({ current: null as Realm | null }));
vi.mock('react', () => ({
  useEffect: () => {},
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (fn: unknown) => fn,
}));
vi.mock('@/relisten/realm/schema', () => ({
  useRealm: () => hookRealm.current,
  useQuery: (type: string, query: (rows: ReturnType<Realm['objects']>) => unknown) =>
    query(hookRealm.current!.objects(type)),
}));
vi.mock('@/relisten/realm/root_services', () => ({}));
vi.mock('@/relisten/util/routes', () => ({}));
vi.mock('@/assets/relisten_white.png', () => ({ default: '' }));
vi.mock('@/relisten/components/flex', () => ({ default: () => null }));
vi.mock('@/relisten/components/relisten_button', () => ({ RelistenButton: () => null }));
vi.mock('@/relisten/components/relisten_text', () => ({ RelistenText: () => null }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('@/relisten/realm/old_ios_schema', () => ({}));
const venuePageState = vi.hoisted(() => ({ results: undefined as unknown }));
vi.mock('@/relisten/realm/models/shows/venue_shows_repo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/relisten/realm/models/shows/venue_shows_repo')>()),
  useArtistVenueShows: () => venuePageState.results,
  useGlobalVenueShows: () => venuePageState.results,
}));
vi.mock('expo-router', () => ({
  useNavigation: () => ({ setOptions: () => {} }),
  useLocalSearchParams: () => ({
    artistUuid,
    venueUuid: 'venue_00000001',
    venueId: 'venue_00000001',
  }),
}));
vi.mock('@/relisten/components/favorite_icon_button', () => ({ FavoriteTargetButton: () => null }));
vi.mock('@/relisten/components/plur', () => ({ default: () => null }));
vi.mock('@/relisten/components/refresh_context', () => ({
  RefreshContextProvider: 'RefreshContextProvider',
}));
vi.mock('@/relisten/components/screens/disappearing_title_screen', () => ({
  DisappearingHeaderScreen: 'Screen',
}));
vi.mock('@/relisten/components/shows_list', () => ({ ShowListContainer: 'ShowList' }));
vi.mock('@/relisten/realm/network_backed_behavior_hooks', () => ({
  useNetworkOnlyResults: () => ({ data: undefined, isNetworkLoading: false, refresh: () => {} }),
  useNetworkBackedBehavior: (behavior: {
    createLocalUpdatingResults(): { currentValue: unknown; tearDown(): void };
  }) => {
    const stream = behavior.createLocalUpdatingResults();
    const data = stream.currentValue;
    stream.tearDown();
    return { data, isNetworkLoading: false, refresh: () => {} };
  },
}));

import { RelistenApiClient } from '@/relisten/api/client';
import { encodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { CatalogTransport } from '@/relisten/api/catalog/transport';
import type {
  ArtistResource,
  ArtistSongEntryResource,
  ArtistVenueEntryResource,
  ArtistVenueResource,
  ImportedSongResource,
  ImportedVenueResource,
  PopularityResource,
  ShowResource,
  ShowSummaryResource,
  SongDetailResource,
  SourceResource,
  SourceSetResource,
  TrackNormalizationResource,
  TrackResource,
  VenueResource,
  YearResource,
  YearWithShowsResource,
} from '@/relisten/api/catalog/resources';
import { Artist } from '@/relisten/realm/models/artist';
import { ArtistFeaturedFlags } from '@/relisten/realm/models/artist';
import { ensureCatalogArtist, artistsNetworkBackedBehavior } from './models/artist_repo';
import { useSongs, ArtistSongsNetworkBackedBehavior } from './models/song_repo';
import {
  Popularity,
  PopularityWindow,
  PopularityWindows,
} from '@/relisten/realm/models/popularity';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
import { SongItem } from './models/song_view';
import { VenueItem } from './models/venue_view';
import { setCatalogFavorite } from '@/relisten/library/favorite_catalog_target';
import { Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { Tour } from '@/relisten/realm/models/tour';
import {
  NormalizedSong,
  NormalizedVenue,
  CATALOG_REALM_MODELS,
} from '@/relisten/realm/models/catalog';
import { Venue } from '@/relisten/realm/models/venue';
import { Year } from '@/relisten/realm/models/year';
import {
  applyArtistList,
  applyArtistSongs,
  applyArtistVenues,
  applyArtistYears,
  applyFullShow,
  applyFullSource,
  applyImportedSongDetail,
  applySongDetail,
  applySongTracks,
  applyTrack,
  applyYearDetail,
  CatalogApplyError,
} from '@/relisten/realm/catalog_apply';
import { ShowWithFullSourcesNetworkBackedBehavior } from './models/show_repo';
import { useSongShows, fetchSongShows } from './models/shows/song_shows_repo';
import { useVenueShows, VenueShowsNetworkBackedBehavior } from './models/shows/venue_shows_repo';
import { fetchSongTracks } from './models/song_tracks_repo';
import { useVenues, ArtistVenuesNetworkBackedBehavior } from './models/venue_repo';
import {
  YearShowsNetworkBackedBehavior,
  yearsNetworkBackedModelArrayBehavior,
} from './models/year_repo';
import { ToursNetworkBackedBehavior } from './models/tour_repo';
import { TourShowsNetworkBackedBehavior } from './models/shows/tour_shows_repo';
import { FavoriteMetadataHydrator } from '../library/favorite_metadata_hydrator';
import { FavoriteRepository } from '../library/favorite_repository';
import { favoriteTargetForCatalogUuid } from '../library/favorite_catalog_target';
import { LegacyDataMigrator } from '../pages/legacy_migration';
import ArtistVenueDetailPage from '../pages/venues/artist_venue_detail_page';
import GlobalVenueDetailPage from '../pages/venues/global_venue_detail_page';
import { UserFavorite, FAVORITE_REALM_MODELS } from './models/library';

const timestamp = '2026-10-31T12:00:00.000Z';
const artistUuid = '00000000-0000-4000-8000-000000000001';
const yearUuid = '00000000-0000-4000-8000-000000000002';
const showUuid = '00000000-0000-4000-8000-000000000003';
const importedVenueUuid = '00000000-0000-4000-8000-000000000004';
const sourceAUuid = '00000000-0000-4000-8000-000000000006';
const sourceBUuid = '00000000-0000-4000-8000-000000000007';
const setAUuid = '00000000-0000-4000-8000-000000000008';
const setBUuid = '00000000-0000-4000-8000-000000000009';
const trackAUuid = '00000000-0000-4000-8000-00000000000a';
const trackBUuid = '00000000-0000-4000-8000-00000000000b';
const trackCUuid = '00000000-0000-4000-8000-00000000000c';
const otherShowUuid = '00000000-0000-4000-8000-00000000000d';
const otherYearUuid = '00000000-0000-4000-8000-00000000000e';
const otherArtistUuid = '00000000-0000-4000-8000-000000000010';
const otherArtistYearUuid = '00000000-0000-4000-8000-000000000011';
const importedSongUuid = '00000000-0000-4000-8000-000000000012';
const tourUuid = '00000000-0000-4000-8000-000000000020';

const artistId = encodeUuidCatalogId(artistUuid, 'artist');
const showId = encodeUuidCatalogId(showUuid, 'show');
const importedVenueId = encodeUuidCatalogId(importedVenueUuid, 'imported_venue');
const sourceAId = encodeUuidCatalogId(sourceAUuid, 'source');
const sourceBId = encodeUuidCatalogId(sourceBUuid, 'source');
const setAId = encodeUuidCatalogId(setAUuid, 'source_set');
const setBId = encodeUuidCatalogId(setBUuid, 'source_set');
const trackAId = encodeUuidCatalogId(trackAUuid, 'track');
const trackBId = encodeUuidCatalogId(trackBUuid, 'track');
const trackCId = encodeUuidCatalogId(trackCUuid, 'track');
const importedSongId = encodeUuidCatalogId(importedSongUuid, 'imported_song');

const features = '16646143'; // All known features except setlist_data_incomplete.

function popularityResource(plays = 100): PopularityResource {
  return {
    momentum_score: 0.7,
    trend_ratio: 2,
    windows: {
      '48h': { plays: 4, hours: 0.5, hot_score: 0.4 },
      '7d': { plays: 10, hours: 1, hot_score: 0.5 },
      '30d': { plays, hours: 10, hot_score: 0.8 },
    },
  };
}

function artistResource(name = 'Test Artist'): ArtistResource {
  return {
    popularity: null,
    id: artistId,
    name,
    slug: 'test-artist',
    sort_name: name,
    musicbrainz_id: null,
    featured: 1,
    show_count: 1,
    source_count: 2,
    created_at: timestamp,
    updated_at: timestamp,
    features,
    upstream_sources: [],
  };
}

function yearResource({
  uuid = yearUuid,
  ownerUuid = artistUuid,
  showCount = 1,
  year = '2026',
}: {
  uuid?: string;
  ownerUuid?: string;
  showCount?: number;
  year?: string;
} = {}): YearResource {
  return {
    popularity: null,
    id: encodeUuidCatalogId(uuid, 'year'),
    artist_id: encodeUuidCatalogId(ownerUuid, 'artist'),
    show_count: showCount,
    source_count: 2,
    duration: 900,
    avg_duration: 900,
    avg_rating: 4.5,
    year,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function tourResource(name = 'Test Tour') {
  return {
    id: encodeUuidCatalogId(tourUuid, 'tour'),
    artist_id: artistId,
    name,
    slug: 'tour',
    upstream_identifier: 'tour',
    show_count: 1,
    start_date: null,
    end_date: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function normalizedVenueResource(name = 'Canonical Hall'): VenueResource {
  return {
    id: 'venue_00000001',
    global_show_count: 12,
    name,
    kind: 'room',
    parent_id: null,
    city: 'San Francisco',
    region: 'CA',
    country: 'US',
    latitude: 37.77,
    longitude: -122.42,
    coordinate_precision: 'venue',
    names: [{ name, kind: 'official' }],
  };
}

function artistVenueResource(name = 'Canonical Hall'): ArtistVenueResource {
  return {
    id: 'artist_venue_00000002',
    artist_id: artistId,
    artist_show_count: 4,
    created_at: timestamp,
    updated_at: timestamp,
    venue: normalizedVenueResource(name),
  };
}

function importedVenueResource(name = 'Imported Hall'): ImportedVenueResource {
  return {
    id: importedVenueId,
    artist_id: artistId,
    show_count: 1,
    latitude: 37.77,
    longitude: -122.42,
    name,
    location: 'San Francisco, CA',
    upstream_identifier: 'imported-hall',
    slug: 'imported-hall',
    past_names: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function songShow(show: ShowSummaryResource) {
  return { show, timings: { single_song: null, multi_song: null } };
}

function normalizedSongDetailResource(
  id: SongDetailResource['id'] = 'song_00000003'
): SongDetailResource {
  return {
    id,
    artist_id: artistId,
    name: 'Canonical Song',
    kind: 'song',
    slug: 'canonical-song',
    original_artist: null,
    aliases: ['Canon Song'],
    matched_track_count: 8,
    matched_show_count: 7,
  };
}

function importedSongResource(name = 'Imported Song'): ImportedSongResource {
  return {
    normalized_song_id: null,
    id: importedSongId,
    artist_id: artistId,
    name,
    slug: name ? 'imported-song' : '',
    upstream_identifier: name ? 'imported-song' : '',
    setlist_show_count: 9,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function showSummaryResource({
  uuid = showUuid,
  year = yearResource(),
  sourceCount = 2,
}: {
  uuid?: string;
  year?: YearResource;
  sourceCount?: number;
} = {}): ShowSummaryResource {
  return {
    id: encodeUuidCatalogId(uuid, 'show'),
    artist_id: artistId,
    year_id: year.id,
    tour_id: null,
    date: timestamp,
    display_date: '2026-10-31',
    avg_rating: 4.5,
    avg_duration: 900,
    most_recent_source_updated_at: timestamp,
    has_soundboard_source: true,
    has_streamable_flac_source: false,
    source_count: sourceCount,
    popularity: null,
    created_at: timestamp,
    updated_at: timestamp,
    imported_venue: importedVenueResource(),
    artist_venue: artistVenueResource(),
    year,
    tour: null,
    era: { order: 1, name: 'Modern' },
  };
}

function normalization(
  text = 'Canonical Song',
  qualifiers: TrackNormalizationResource['parts'][number]['qualifiers'] = []
): TrackNormalizationResource {
  return {
    state: 'interpreted',
    reason: null,
    parts: [
      {
        ordinal: 0,
        text,
        state: 'matched',
        qualifiers,
        notes: [],
        segue_after: false,
        song: {
          id: 'song_00000003',
          artist_id: artistId,
          name: text,
          kind: null,
        },
      },
    ],
  };
}

function trackResource({
  id = trackAId,
  sourceId = sourceAId,
  setId = setAId,
  title = 'Imported Track Title',
  trackNormalization = normalization(),
}: {
  id?: TrackResource['id'];
  sourceId?: TrackResource['source_id'];
  setId?: TrackResource['source_set_id'];
  title?: string;
  trackNormalization?: TrackNormalizationResource;
} = {}): TrackResource {
  return {
    id,
    source_id: sourceId,
    source_set_id: setId,
    show_id: showId,
    artist_id: artistId,
    track_position: 1,
    duration: 300,
    title,
    slug: 'imported-track-title',
    mp3_url: `https://example.com/${id}.mp3`,
    mp3_md5: null,
    flac_url: null,
    flac_md5: null,
    created_at: timestamp,
    updated_at: timestamp,
    normalization: trackNormalization,
  };
}

function sourceSetResource(
  id: SourceSetResource['id'],
  sourceId: SourceSetResource['source_id'],
  tracks: TrackResource[]
): SourceSetResource {
  return {
    id,
    source_id: sourceId,
    artist_id: artistId,
    index: id === setAId ? 0 : 1,
    is_encore: false,
    name: id === setAId ? 'Set 1' : 'Set 2',
    created_at: timestamp,
    updated_at: timestamp,
    tracks,
  };
}

function sourceResource(id: SourceResource['id'], sets: SourceSetResource[]): SourceResource {
  return {
    id,
    artist_id: artistId,
    show_id: showId,
    display_date: '2026-10-31',
    is_soundboard: id === sourceAId,
    is_remaster: false,
    has_jamcharts: false,
    avg_rating: 4.5,
    num_reviews: 1,
    num_ratings: 1,
    avg_rating_weighted: 4.5,
    duration: 900,
    upstream_identifier: id,
    description: null,
    taper_notes: null,
    source: 'SBD',
    taper: null,
    transferrer: null,
    lineage: null,
    flac_type: 'NoFlac',
    review_count: 1,
    created_at: timestamp,
    updated_at: timestamp,
    imported_venue: null,
    sets,
    links: [],
  };
}

function fullShowResource(sources: SourceResource[]): ShowResource {
  return { ...showSummaryResource(), sources };
}

function yearWithShowsResource(
  year = yearResource(),
  shows: ShowSummaryResource[] = [showSummaryResource({ year })]
): YearWithShowsResource {
  return { ...year, shows };
}

function seedArtistAndYear(realm: Realm) {
  applyArtistList(realm, [artistResource()]);
  applyArtistYears(realm, artistUuid, [yearResource()]);
}

describe('catalog Realm apply', () => {
  let directory: string;
  let realm: Realm;
  let executors: { tearDown(): void }[];

  beforeEach(async () => {
    executors = [];
    directory = mkdtempSync(join(tmpdir(), 'relisten-catalog-apply-'));
    realm = await Realm.open({
      path: join(directory, 'catalog.realm'),
      schemaVersion: 1,
      schema: [
        Artist,
        Year,
        Show,
        Venue,
        Tour,
        Song,
        Source,
        SourceSet,
        SourceTrack,
        SourceTrackOfflineInfo,
        ...FAVORITE_REALM_MODELS,
        Popularity,
        PopularityWindows,
        PopularityWindow,
        ...CATALOG_REALM_MODELS,
      ],
    });
  });

  afterEach(async () => {
    // Realm's React object cache defers listener registration during writes.
    // Let that registration finish before disposing streams and closing the test Realm.
    await new Promise<void>((resolve) => setImmediate(resolve));
    for (const executor of executors) {
      executor.tearDown();
    }
    if (!realm.isClosed) {
      realm.close();
    }
    rmSync(directory, { force: true, recursive: true });
    vi.useRealTimers();
  });

  it.each([
    ['0', { descriptions: false, track_durations: false, normalization: false }],
    ['10485761', { descriptions: true, track_durations: true, normalization: true }],
    ['9223372036854775809', { descriptions: true, track_durations: false, normalization: false }],
  ])(
    'stores feature mask %s as existing boolean JSON through the artist API',
    async (mask, expected) => {
      const upstreamSources = [
        { provider: 'archive.org', upstream_identifier: 'collection-one' },
        { provider: 'archive.org', upstream_identifier: 'collection-two' },
        { provider: null, upstream_identifier: 'unknown-provider-id' },
      ];
      const api = new RelistenApiClient({
        transport: new CatalogTransport({
          apiBase: 'https://catalog.test/api',
          fetch: async () =>
            new Response(
              JSON.stringify([
                { ...artistResource(), features: mask, upstream_sources: upstreamSources },
              ])
            ),
        }),
      });
      const executor = artistsNetworkBackedBehavior(realm, false, false, 'all').sharedExecutor(api);
      executors.push(executor);
      await executor.refresh();
      expect(executor.currentResults().errors).toBeUndefined();
      const artist = realm.objectForPrimaryKey(Artist, artistUuid)!;
      expect(JSON.parse(artist.featuresRaw)).toMatchObject(expected);
      expect(artist.features()).toMatchObject(expected);
      expect(artist.upstreamSources()).toEqual(upstreamSources);
    }
  );

  it('reads existing stored feature booleans without a migration or network request', () => {
    realm.write(() => {
      applyArtistList(realm, [artistResource()]);
      realm.objectForPrimaryKey(Artist, artistUuid)!.featuresRaw = JSON.stringify({
        ratings: true,
        multiple_sources: true,
        sets: false,
      });
    });
    expect(realm.objectForPrimaryKey(Artist, artistUuid)!.features()).toEqual({
      ratings: true,
      multiple_sources: true,
      sets: false,
    });
  });

  it('applies corrected normalization at an unchanged track timestamp without flattening the imported title or rich song detail', () => {
    const initialNormalization = normalization();
    initialNormalization.parts.push({
      ordinal: 1,
      text: 'Unresolved Tail',
      state: 'unresolved',
      qualifiers: [],
      notes: [],
      segue_after: false,
      song: null,
    });
    realm.write(() => {
      seedArtistAndYear(realm);
      realm.create(NormalizedSong, {
        id: 'song_00000003',
        artistUuid,
        name: 'Canonical Song',
        kind: 'song',
        slug: 'canonical-song',
        originalArtist: 'Original Artist',
        aliases: ['Old Alias'],
        matchedTrackCount: 7,
        matchedShowCount: 5,
        artist: realm.objectForPrimaryKey(Artist, artistUuid)!,
      });
      applyFullShow(
        realm,
        fullShowResource([
          sourceResource(sourceAId, [
            sourceSetResource(setAId, sourceAId, [
              trackResource({ trackNormalization: initialNormalization }),
            ]),
          ]),
        ])
      );
    });

    const track = realm.objectForPrimaryKey(SourceTrack, trackAUuid)!;

    realm.write(() => {
      realm.objectForPrimaryKey(SourceTrack, trackAUuid)!.deletedAt = new Date(timestamp);
      const correctedTrack = trackResource({
        trackNormalization: normalization('Corrected Canonical Song', ['reprise']),
      });
      correctedTrack.duration = null;
      applyTrack(realm, correctedTrack);
    });

    const song = realm.objectForPrimaryKey(NormalizedSong, 'song_00000003')!;
    expect(track.updatedAt.toISOString()).toBe(timestamp);
    expect(track.isValid()).toBe(true);
    expect(track.deletedAt).toBeNull();
    expect(track.duration).toBeNull();
    expect(track.title).toBe('Imported Track Title');
    expect(track.normalization?.parts).toHaveLength(1);
    expect(track.normalization?.parts[0].text).toBe('Corrected Canonical Song');
    expect(Array.from(track.normalization?.parts[0].qualifiers ?? [])).toEqual(['reprise']);
    expect(song.name).toBe('Corrected Canonical Song');
    expect(song.kind).toBeNull();
    expect(song.slug).toBe('canonical-song');
    expect(song.originalArtist).toBe('Original Artist');
    expect(Array.from(song.aliases)).toEqual(['Old Alias']);
    expect(song.matchedTrackCount).toBe(7);
    expect(song.matchedShowCount).toBe(5);
  });

  it('applies ordered mixed venue and song browse membership without duplicating it', () => {
    const venues: ArtistVenueEntryResource[] = [
      {
        kind: 'artist_venue',
        artist_venue: artistVenueResource(),
        imported_venue: null,
      },
      {
        kind: 'imported_venue',
        artist_venue: null,
        imported_venue: importedVenueResource(),
      },
    ];
    const songs: ArtistSongEntryResource[] = [
      {
        kind: 'song',
        song: normalizedSongDetailResource(),
        imported_song: null,
      },
      {
        kind: 'imported_song',
        song: null,
        imported_song: importedSongResource(''),
      },
    ];

    const [venueIds, songIds] = realm.write(() => {
      applyArtistList(realm, [artistResource()]);
      return [
        applyArtistVenues(realm, artistUuid, venues),
        applyArtistSongs(realm, artistUuid, songs),
      ];
    });

    expect(venueIds).toEqual(['artist_venue_00000002', importedVenueId]);
    expect(songIds).toEqual(['song_00000003', importedSongId]);
    expect(realm.objectForPrimaryKey(Song, importedSongUuid)?.name).toBe('');

    expect(() =>
      realm.write(() => applyArtistSongs(realm, artistUuid, [songs[0], songs[0]]))
    ).toThrow('contains duplicate identities');
    expect(() =>
      realm.write(() =>
        applyArtistVenues(realm, artistUuid, [
          {
            kind: 'artist_venue',
            artist_venue: null,
            imported_venue: null,
          } as unknown as ArtistVenueEntryResource,
        ])
      )
    ).toThrow('inconsistent kind and target');
  });

  it('keeps live wrappers and show labels when artist browse soft-prunes cached entries', async () => {
    realm.write(() => {
      seedArtistAndYear(realm);
      applyYearDetail(realm, artistUuid, yearUuid, yearWithShowsResource());
      applyArtistSongs(realm, artistUuid, [
        { kind: 'song', song: normalizedSongDetailResource(), imported_song: null },
        { kind: 'imported_song', song: null, imported_song: importedSongResource() },
      ]);
      applyArtistVenues(realm, artistUuid, [
        { kind: 'artist_venue', artist_venue: artistVenueResource(), imported_venue: null },
        { kind: 'imported_venue', artist_venue: null, imported_venue: importedVenueResource() },
      ]);
    });
    const song = new SongItem(realm.objectForPrimaryKey(Song, importedSongUuid)!);
    const venue = new VenueItem(realm.objectForPrimaryKey(Venue, importedVenueUuid)!);
    const artistVenue = new VenueItem(realm.objects('ArtistVenue')[0] as never);
    const stream = new ArtistSongsNetworkBackedBehavior(
      realm,
      artistUuid
    ).createLocalUpdatingResults();
    executors.push(stream);
    realm.write(() => {
      song.record.name = 'Corrected song';
      realm.objectForPrimaryKey(Venue, importedVenueUuid)!.name = 'Corrected venue';
    });
    expect(song.name).toBe('Corrected song');
    expect(venue.name).toBe('Corrected venue');
    await vi.waitFor(() =>
      expect(stream.currentValue.find((row) => row.uuid === importedSongId)?.name).toBe(
        'Corrected song'
      )
    );
    realm.write(() => {
      applyArtistSongs(realm, artistUuid, [
        { kind: 'song', song: normalizedSongDetailResource(), imported_song: null },
      ]);
      applyArtistVenues(realm, artistUuid, [
        { kind: 'artist_venue', artist_venue: artistVenueResource(), imported_venue: null },
      ]);
    });
    hookRealm.current = realm;
    expect(useSongs(artistUuid).data.map((row) => row.uuid)).toEqual(['song_00000003']);
    expect(useVenues(artistUuid).data.map((row) => row.uuid)).toEqual(['venue_00000001']);
    expect(realm.objectForPrimaryKey(Show, showUuid)!.venue?.name).toBe('Corrected venue');
    expect(realm.objectForPrimaryKey(Show, showUuid)!.artistVenue?.venue.id).toBe(artistVenue.uuid);
    // A later embedded venue update changes metadata without restoring browse visibility.
    realm.write(() => applyYearDetail(realm, artistUuid, yearUuid, yearWithShowsResource()));
    expect(useVenues(artistUuid).data.map((row) => row.uuid)).toEqual(['venue_00000001']);
    realm.write(() =>
      applyArtistVenues(realm, artistUuid, [
        { kind: 'imported_venue', artist_venue: null, imported_venue: importedVenueResource() },
      ])
    );
    expect(useVenues(artistUuid).data.map((row) => row.uuid)).toEqual([importedVenueId]);
    expect(realm.objectForPrimaryKey(Show, showUuid)!.artistVenue).not.toBeNull();
  });

  it('applies imported song mappings at the same upstream timestamp without requiring target metadata', () => {
    realm.write(() => {
      seedArtistAndYear(realm);
      applyImportedSongDetail(realm, artistUuid, {
        ...importedSongResource(),
        normalized_song_id: 'song_00000099',
        shows: [],
      });
    });
    const row = realm.objectForPrimaryKey(Song, importedSongUuid)!;
    const updatedAt = row.updatedAt.getTime();
    expect(row.normalizedSongId).toBe('song_00000099');
    expect(realm.objectForPrimaryKey(NormalizedSong, 'song_00000099')).toBeNull();
    realm.write(() =>
      applyImportedSongDetail(realm, artistUuid, {
        ...importedSongResource(),
        normalized_song_id: null,
        shows: [],
      })
    );
    expect(row.normalizedSongId).toBeNull();
    expect(row.updatedAt.getTime()).toBe(updatedAt);
  });

  it('stores ordinary artist/year scores for existing sorts and clears corrected inactive scores', async () => {
    const metrics = popularityResource();
    let popularity: typeof metrics | null = metrics;
    const api = new RelistenApiClient({
      transport: new CatalogTransport({
        apiBase: 'https://catalog.test/api',
        fetch: async (input) =>
          new Response(
            JSON.stringify(
              String(input).includes('/years')
                ? [{ ...yearResource(), popularity }]
                : [{ ...artistResource(), popularity }]
            ),
            { headers: { etag: popularity ? '"scored"' : '"inactive"' } }
          ),
      }),
    });
    const artists = artistsNetworkBackedBehavior(realm, false, false, 'all').sharedExecutor(api);
    const years = yearsNetworkBackedModelArrayBehavior(
      realm,
      false,
      artistUuid,
      false
    ).sharedExecutor(api);
    executors.push(artists, years);
    await artists.refresh();
    await years.refresh();
    expect(artists.currentResults().errors).toBeUndefined();
    expect(years.currentResults().errors).toBeUndefined();
    const artist = realm.objectForPrimaryKey(Artist, artistUuid)!;
    const year = realm.objectForPrimaryKey(Year, yearUuid)!;
    for (const model of [artist, year]) {
      expect(model.popularity?.windows.days30d.hotScore).toBe(0.8);
      expect(model.popularity?.momentumScore).toBe(0.7);
      expect(model.popularity?.windows.hours48h.plays).toBe(4);
    }
    const updatedAt = year.updatedAt.getTime();

    // A score correction has its own response/ETag, independent of imported timestamps.
    popularity = null;
    await artists.refresh(true);
    await years.refresh(true);
    expect(artist.popularity).toBeNull();
    expect(year.popularity).toBeNull();
    expect(year.updatedAt.getTime()).toBe(updatedAt);
  });

  it('retains auto-created artists from the complete response while applying screen visibility locally', async () => {
    const ordinary = artistResource();
    const automatic = {
      ...artistResource('Automatic Artist'),
      id: encodeUuidCatalogId(otherArtistUuid, 'artist'),
      featured: ArtistFeaturedFlags.AutoCreated,
    };
    realm.write(() => applyArtistList(realm, [automatic]));
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const includeAutomatic =
        new URL(String(input)).searchParams.get('include_autocreated') === 'true';
      return new Response(JSON.stringify(includeAutomatic ? [ordinary, automatic] : [ordinary]), {
        headers: { etag: '"artists"' },
      });
    });
    const api = new RelistenApiClient({
      transport: new CatalogTransport({ apiBase: 'https://catalog.test/api', fetch }),
    });
    const visible = artistsNetworkBackedBehavior(
      realm,
      false,
      false,
      new Set<string>()
    ).sharedExecutor(api);
    executors.push(visible);
    await visible.refresh();
    expect([...visible.currentResults().data].map((artist) => artist.uuid)).toEqual([artistUuid]);
    expect(realm.objectForPrimaryKey(Artist, otherArtistUuid)?.deletedAt).toBeNull();

    const all = artistsNetworkBackedBehavior(realm, false, false, 'all').sharedExecutor(api);
    const favorited = artistsNetworkBackedBehavior(
      realm,
      false,
      false,
      new Set([otherArtistUuid])
    ).sharedExecutor(api);
    executors.push(all, favorited);
    await all.refresh();
    await favorited.refresh();
    expect(all.currentResults().data).toHaveLength(2);
    expect(favorited.currentResults().data).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('loads mixed browse, relational venue detail, and online song results through the API', async () => {
    realm.write(() => seedArtistAndYear(realm));
    const venue = artistVenueResource();
    const song = normalizedSongDetailResource();
    const venueAlias = 'venue_00000099';
    const songAlias = 'song_00000099';
    const show = showSummaryResource();
    const responses = new Map<string, object>([
      ['/artists', [artistResource()]],
      [
        `/artists/${artistId}/venues`,
        [
          { kind: 'artist_venue', artist_venue: venue, imported_venue: null },
          {
            kind: 'imported_venue',
            artist_venue: null,
            imported_venue: importedVenueResource(),
          },
        ],
      ],
      [
        `/artists/${artistId}/songs`,
        [
          { kind: 'song', song, imported_song: null },
          { kind: 'imported_song', song: null, imported_song: importedSongResource() },
        ],
      ],
      [`/artists/${artistId}/venues/${venue.venue.id}`, { ...venue, shows: [show] }],
      [`/venues/${venue.venue.id}`, { ...venue.venue, shows: [show] }],
      [`/imported-venues/${importedVenueId}`, { ...importedVenueResource(), shows: [show] }],
      [`/songs/${song.id}`, { ...song, shows: [songShow(show)] }],
      [`/imported-songs/${importedSongId}`, { ...importedSongResource(), shows: [show] }],
      [`/songs/${song.id}/tracks`, { ...song, tracks: [trackResource()] }],
      [`/artists/${artistId}/venues/${venueAlias}`, { ...venue, shows: [show] }],
      [`/venues/${venueAlias}`, { ...venue.venue, shows: [show] }],
      [`/songs/${songAlias}`, { ...song, shows: [songShow(show)] }],
      [`/songs/${songAlias}/tracks`, { ...song, tracks: [trackResource()] }],
    ]);
    const api = new RelistenApiClient({
      transport: new CatalogTransport({
        apiBase: 'https://catalog.test/api',
        fetch: async (input) => {
          const path = new URL(String(input)).pathname.replace('/api/v4', '');
          const payload = responses.get(path);
          if (!payload) {
            throw new Error(`Unexpected endpoint ${path}`);
          }
          return new Response(JSON.stringify(payload), { headers: { etag: `"${path}"` } });
        },
      }),
    });
    const cases = [
      {
        repo: new ArtistVenuesNetworkBackedBehavior(realm, artistUuid),
        ids: [venue.venue.id, importedVenueId],
      },
      {
        repo: new ArtistSongsNetworkBackedBehavior(realm, artistUuid),
        ids: [song.id, importedSongId],
      },
      {
        repo: new VenueShowsNetworkBackedBehavior(realm, artistUuid, venue.venue.id),
        ids: [venue.venue.id, showId],
      },
      {
        repo: new VenueShowsNetworkBackedBehavior(realm, undefined, venue.venue.id),
        ids: [venue.venue.id, showId],
      },
      {
        repo: new VenueShowsNetworkBackedBehavior(realm, artistUuid, importedVenueUuid),
        ids: [importedVenueId, showId],
      },
      {
        repo: new VenueShowsNetworkBackedBehavior(realm, artistUuid, venueAlias),
        ids: [venue.venue.id, showId],
      },
      {
        repo: new VenueShowsNetworkBackedBehavior(realm, undefined, venueAlias),
        ids: [venue.venue.id, showId],
      },
    ];

    for (const { repo, ids } of cases) {
      const executor = repo.sharedExecutor(api);
      executors.push(executor);
      await executor.refresh(true);
      expect(executor.currentResults().errors).toBeUndefined();
      await vi.waitFor(() => {
        const data = executor.currentResults().data;
        if (Array.isArray(data)) {
          expect(data.map((item) => item.uuid)).toEqual(ids);
          return;
        }
        const children = data.shows.map((show) => encodeUuidCatalogId(show.uuid, 'show'));
        expect([data.venue?.uuid, ...children]).toEqual(ids);
        expect(data.isAvailable).toBe(true);
      });
    }
    const onlineSong = await fetchSongShows(realm, api, artistUuid, song.id);
    expect(onlineSong.error).toBeUndefined();
    expect(onlineSong.data?.shows.map((row) => row.uuid)).toEqual([showUuid]);
    const importedSong = await fetchSongShows(realm, api, artistUuid, importedSongUuid);
    expect(importedSong.data?.song?.favorite.targetKind).toBe('imported_song');
    const recordings = await fetchSongTracks(realm, api, artistUuid, song.id);
    expect(recordings.error).toBeUndefined();
    expect(recordings.data?.tracks.map((row) => row.uuid)).toEqual([trackAUuid]);
    // Another screen can consume the same shared HTTP response and still get its own list.
    const [first, second] = await Promise.all([
      fetchSongShows(realm, api, artistUuid, song.id),
      fetchSongShows(realm, api, artistUuid, song.id),
    ]);
    expect(first.data?.shows.map((row) => row.uuid)).toEqual([showUuid]);
    expect(second.data?.shows.map((row) => row.uuid)).toEqual([showUuid]);
    hookRealm.current = realm;
    const songItems = useSongs(artistUuid).data;
    expect(songItems.map((item) => [item.name, item.favorite.targetKind])).toEqual([
      [song.name, 'song'],
      [importedSongResource().name, 'imported_song'],
    ]);
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.title).toBe('Imported Track Title');
  });

  it('uses the same favorite control contract for imported and normalized browse items', async () => {
    realm.write(() => {
      seedArtistAndYear(realm);
      applyArtistSongs(realm, artistUuid, [
        { kind: 'song', song: normalizedSongDetailResource(), imported_song: null },
        { kind: 'imported_song', song: null, imported_song: importedSongResource() },
      ]);
      applyArtistVenues(realm, artistUuid, [
        { kind: 'artist_venue', artist_venue: artistVenueResource(), imported_venue: null },
        { kind: 'imported_venue', artist_venue: null, imported_venue: importedVenueResource() },
      ]);
    });
    hookRealm.current = realm;
    const capture = { scopeId: 'anonymous', generation: 1 };
    const scope = { capture: () => capture, isCurrent: () => true, subscribe: () => () => {} };
    const repository = new FavoriteRepository(realm, scope);
    const library = new LibraryIndex(realm, scope);
    executors.push(library);
    const controls = [...useSongs(artistUuid).data, ...useVenues(artistUuid).data].map(
      (item) => item.favorite
    );
    for (const control of controls)
      setCatalogFavorite(repository, control.targetKind, control.catalogId, true);
    await vi.waitFor(() =>
      expect(
        controls.every((control) => library.isFavorite(control.targetKind, control.catalogId))
      ).toBe(true)
    );
    expect(
      repository
        .activeFavorites('anonymous')
        .map((favorite) => favorite.targetId)
        .sort()
    ).toEqual(['song_00000003', importedSongId, 'venue_00000001', importedVenueId].sort());
    for (const control of controls)
      setCatalogFavorite(repository, control.targetKind, control.catalogId, false);
    await vi.waitFor(() =>
      expect(
        controls.some((control) => library.isFavorite(control.targetKind, control.catalogId))
      ).toBe(false)
    );
    expect(repository.activeFavorites('anonymous')).toHaveLength(0);
  });

  it('keeps favorite snapshots stable across identical artist responses while publishing membership changes', async () => {
    const artist = { ...artistResource(), popularity: popularityResource() };
    realm.write(() => {
      seedArtistAndYear(realm);
      applyArtistList(realm, [artist]);
      applyYearDetail(realm, artistUuid, yearUuid, yearWithShowsResource());
    });
    const scope = {
      capture: () => ({ scopeId: 'anonymous', generation: 1 }),
      isCurrent: () => true,
      subscribe: () => () => {},
    };
    const library = new LibraryIndex(realm, scope);
    executors.push(library);
    const notify = vi.fn();
    library.subscribeLibraryMembership(notify);
    await vi.waitFor(() => expect(notify).toHaveBeenCalled());
    const emptySnapshot = library.favoriteCatalogUuids('artist');
    notify.mockClear();

    // Replacing embedded popularity notifies the cached show's linked artist.
    realm.write(() => applyArtistList(realm, [artist]));
    await vi.waitFor(() => expect(notify).toHaveBeenCalled());
    expect(library.favoriteCatalogUuids('artist')).toBe(emptySnapshot);

    const repository = new FavoriteRepository(realm, scope);
    const target = favoriteTargetForCatalogUuid('artist', artistUuid);
    repository.setFavorite({ ...target, isFavorite: true });
    await vi.waitFor(() =>
      expect(library.favoriteCatalogUuids('artist').has(artistUuid)).toBe(true)
    );
    const favoriteSnapshot = library.favoriteCatalogUuids('artist');
    expect(favoriteSnapshot).not.toBe(emptySnapshot);
    expect(emptySnapshot.size).toBe(0);

    repository.setFavorite({ ...target, isFavorite: false });
    await vi.waitFor(() =>
      expect(library.favoriteCatalogUuids('artist').has(artistUuid)).toBe(false)
    );
    expect(library.favoriteCatalogUuids('artist')).not.toBe(favoriteSnapshot);
    expect(favoriteSnapshot.has(artistUuid)).toBe(true);
  });

  it.each(['present', 'missing', 'error'] as const)(
    'waits for the recording response before importing a legacy source favorite (%s)',
    async (outcome) => {
      realm.write(() => {
        seedArtistAndYear(realm);
        applyYearDetail(realm, artistUuid, yearUuid, yearWithShowsResource());
      });
      let finish!: (response: Response) => void;
      const api = new RelistenApiClient({
        transport: new CatalogTransport({
          apiBase: 'https://migration.test/api',
          fetch: () =>
            new Promise<Response>((resolve) => {
              finish = resolve;
            }),
        }),
      });
      const scope = {
        capture: () => ({ scopeId: 'anonymous', generation: 1 }),
        isCurrent: () => true,
        subscribe: () => () => {},
      };
      const repository = new FavoriteRepository(realm, scope);
      const migrator = new LegacyDataMigrator(api, realm, repository);
      let complete = false;
      const pending = migrator
        .migrateFavoriteSource({
          uuid: sourceAUuid,
          artist_uuid: artistUuid,
          show_uuid: showUuid,
          created_at: new Date(timestamp),
          show_date: new Date(timestamp),
        })
        .then((result) => {
          complete = true;
          return result;
        });
      const sources =
        outcome === 'present'
          ? [sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])])]
          : [];
      try {
        await vi.waitFor(() => expect(finish).toBeDefined());
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(complete).toBe(false);
      } finally {
        finish(
          new Response(JSON.stringify(fullShowResource(sources)), {
            status: outcome === 'error' ? 404 : 200,
          })
        );
        await pending;
      }
      const result = await pending;
      expect(result).toMatchObject({
        success: outcome === 'present',
        migrated: outcome === 'present',
      });
      expect(repository.isFavorite(favoriteTargetForCatalogUuid('source', sourceAUuid))).toBe(
        outcome === 'present'
      );
      if (outcome === 'missing') expect(result.message).toBe('Source not found');
      if (outcome === 'error') expect(result.message).toContain('HTTP 404');
    }
  );

  it('applies shallow song tracks without taking source, set, or offline ownership', () => {
    const fullShow = fullShowResource([
      sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])]),
    ]);
    fullShow.source_count = 1;

    realm.write(() => {
      seedArtistAndYear(realm);
      applyFullShow(realm, fullShow);
      const offlineInfo = realm.create(SourceTrackOfflineInfo, {
        sourceTrackUuid: trackAUuid,
        status: SourceTrackOfflineInfoStatus.Succeeded,
        type: SourceTrackOfflineInfoType.UserInitiated,
        queuedAt: new Date(timestamp),
        startedAt: new Date(timestamp),
        completedAt: new Date(timestamp),
        downloadedBytes: 123,
        totalBytes: 123,
        percent: 1,
      });
      realm.objectForPrimaryKey(SourceTrack, trackAUuid)!.offlineInfo = offlineInfo;
    });

    const correctedTrack = trackResource({ title: 'Corrected Imported Title' });
    const resultIds = realm.write(() =>
      applySongTracks(realm, artistUuid, {
        ...normalizedSongDetailResource(),
        tracks: [correctedTrack],
      })
    );

    const track = realm.objectForPrimaryKey(SourceTrack, trackAUuid)!;
    expect(resultIds.song.id).toBe('song_00000003');
    expect(resultIds.tracks.map((row) => row.uuid)).toEqual([trackAUuid]);
    expect(track.title).toBe('Corrected Imported Title');
    expect(track.offlineInfo?.downloadedBytes).toBe(123);
    expect(track.source?.uuid).toBe(sourceAUuid);
    expect(realm.objectForPrimaryKey(SourceSet, setAUuid)?.sourceTracks[0].uuid).toBe(trackAUuid);
  });

  it('preserves multipart song references and corrections while reusing the owning song', () => {
    const song = normalizedSongDetailResource();
    const matching = normalization(song.name);
    matching.parts[0].song = {
      id: song.id,
      artist_id: song.artist_id,
      name: song.name,
      kind: song.kind,
    };
    matching.parts.push({
      ...matching.parts[0],
      ordinal: 1,
      song: { ...matching.parts[0].song, id: 'song_00000004', name: 'Other Song' },
    });
    const matchingTrack = trackResource({ trackNormalization: matching });
    const correctedTrack = trackResource({
      id: trackBId,
      trackNormalization: normalization('Corrected Song', ['reprise']),
    });

    realm.write(() => {
      seedArtistAndYear(realm);
      applySongDetail(realm, artistUuid, { ...song, shows: [songShow(showSummaryResource())] });
      applySongTracks(realm, artistUuid, { ...song, tracks: [matchingTrack, correctedTrack] });
    });

    const storedSong = realm.objectForPrimaryKey(NormalizedSong, song.id)!;
    expect(storedSong.name).toBe('Corrected Song');
    expect(storedSong.kind).toBeNull();
    expect([...storedSong.aliases]).toEqual(song.aliases);
    expect(storedSong.slug).toBe(song.slug);
    expect(realm.objectForPrimaryKey(NormalizedSong, 'song_00000004')?.name).toBe('Other Song');
    expect(
      realm
        .objectForPrimaryKey(SourceTrack, trackAUuid)
        ?.normalization?.parts.map((part) => part.song?.id)
    ).toEqual([song.id, 'song_00000004']);

    // Later references in the same response still own scalar corrections.
    realm.write(() =>
      applySongTracks(realm, artistUuid, { ...song, tracks: [correctedTrack, matchingTrack] })
    );
    expect(storedSong.name).toBe(song.name);
    expect(storedSong.kind).toBe(song.kind);
    expect([...storedSong.aliases]).toEqual(song.aliases);
    expect(realm.objectForPrimaryKey(SourceTrack, trackBUuid)?.updatedAt.toISOString()).toBe(
      timestamp
    );

    matching.parts[0].song!.artist_id = encodeUuidCatalogId(otherArtistUuid, 'artist');
    expect(() =>
      realm.write(() => applySongTracks(realm, artistUuid, { ...song, tracks: [matchingTrack] }))
    ).toThrow(CatalogApplyError);
    expect(storedSong.name).toBe(song.name);
  });

  it('loads online recording results and refreshes new show parents', async () => {
    realm.write(() => applyArtistList(realm, [artistResource()]));
    const songId = 'song_00000003';
    const songPath = `/songs/${songId}`;
    const tracksPath = `${songPath}/tracks`;
    const matchedTrack = trackResource();
    matchedTrack.normalization.parts[0].song!.kind = 'song';
    const songPayload = {
      ...normalizedSongDetailResource(),
      shows: [songShow(showSummaryResource({ sourceCount: 0 }))],
    };
    const tracksPayload = {
      ...normalizedSongDetailResource(),
      tracks: [matchedTrack],
    };
    let songRequests = 0;
    let trackRequests = 0;
    const transport = new CatalogTransport({
      apiBase: 'https://catalog.example/api',
      fetch: async (input, init) => {
        expect(new Headers(init?.headers).has('If-None-Match')).toBe(false);
        const path = new URL(String(input)).pathname.replace('/api/v4', '');
        if (path === songPath) {
          songRequests += 1;
          return new Response(JSON.stringify(songPayload), {
            status: 200,
            headers: { etag: `W/"song-${songRequests}"` },
          });
        }
        if (path === tracksPath) {
          trackRequests += 1;
          return new Response(JSON.stringify(tracksPayload), {
            status: 200,
            headers: { etag: `W/"tracks-${trackRequests}"` },
          });
        }
        throw new Error(`Unexpected request ${path}`);
      },
    });
    const api = new RelistenApiClient({ transport });
    expect(realm.objects(Show)).toHaveLength(0);
    let tracks = await fetchSongTracks(realm, api, artistUuid, songId);
    expect(tracks.error).toBeUndefined();
    expect(tracks.data?.tracks.map((row) => row.uuid)).toEqual([trackAUuid]);
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.show?.uuid).toBe(showUuid);
    realm.write(() =>
      applyArtistSongs(realm, artistUuid, [
        {
          kind: 'song',
          song: { ...normalizedSongDetailResource(), name: 'Older Canonical Song' },
          imported_song: null,
        },
      ])
    );

    songPayload.shows.push(songShow(showSummaryResource({ uuid: otherShowUuid, sourceCount: 0 })));
    tracksPayload.tracks.push({
      ...trackResource({ id: trackBId }),
      show_id: encodeUuidCatalogId(otherShowUuid, 'show'),
    });
    tracks = await fetchSongTracks(realm, api, artistUuid, songId, true);
    expect(tracks.error).toBeUndefined();
    expect([songRequests, trackRequests]).toEqual([2, 2]);
    expect(realm.objectForPrimaryKey(SourceTrack, trackBUuid)?.show?.uuid).toBe(otherShowUuid);
    expect(realm.objectForPrimaryKey(NormalizedSong, songId)?.name).toBe('Canonical Song');
  });

  it('follows tour relationships across inventory and show corrections', async () => {
    realm.write(() => seedArtistAndYear(realm));
    const tour = tourResource('Corrected Tour');
    const tourId = tour.id;
    let shows = [{ ...showSummaryResource(), tour_id: tourId, tour }];
    const otherTourUuid = '00000000-0000-4000-8000-000000000021';
    const otherTour = { ...tour, id: encodeUuidCatalogId(otherTourUuid, 'tour') };
    const movedShow = {
      ...fullShowResource([]),
      tour_id: otherTour.id,
      tour: otherTour,
      source_count: 0,
      display_date: 'Moved to another tour',
    };
    const validators: (string | null)[] = [];
    const api = new RelistenApiClient({
      transport: new CatalogTransport({
        apiBase: 'https://catalog.test/api',
        fetch: async (input, options) => {
          if (String(input).includes('/shows/')) {
            return new Response(JSON.stringify(movedShow), {
              headers: { etag: '"show-detail"' },
            });
          }
          if (String(input).includes('/artists/')) {
            return new Response(JSON.stringify([{ ...tour, name: 'Old Tour' }, otherTour]), {
              headers: { etag: '"old-tours"' },
            });
          }
          validators.push(new Headers(options?.headers).get('if-none-match'));
          return new Response(JSON.stringify({ ...tour, shows }), {
            headers: { etag: '"tour-detail"' },
          });
        },
      }),
    });
    const detail = new TourShowsNetworkBackedBehavior(realm, artistUuid, tourUuid).sharedExecutor(
      api
    );
    const inventory = new ToursNetworkBackedBehavior(realm, artistUuid).sharedExecutor(api);
    const show = new ShowWithFullSourcesNetworkBackedBehavior(realm, showUuid).sharedExecutor(api);
    executors.push(detail, inventory, show);
    await detail.refresh();
    await vi.waitFor(() => expect(detail.currentResults().data.shows).toHaveLength(1));
    await inventory.refresh();
    expect(realm.objectForPrimaryKey(Tour, tourUuid)?.name).toBe('Old Tour');
    expect(detail.currentResults().data.shows.map((show) => show.uuid)).toEqual([showUuid]);

    await detail.refresh();
    await detail.refresh();
    expect(validators).toEqual([null, null, null]);
    expect(detail.currentResults().data.tour?.name).toBe('Corrected Tour');

    const observedDates: (string | undefined)[] = [];
    const unsubscribe = detail.start().addListener((result) => {
      observedDates.push(result.data.shows[0]?.displayDate);
    });
    await detail.refresh();
    await show.refresh(true);
    await vi.waitFor(() => expect(detail.currentResults().data.shows).toEqual([]));
    expect(realm.objectForPrimaryKey(Show, showUuid)?.tourUuid).toBe(otherTourUuid);

    movedShow.display_date = 'Updated after the move';
    await show.refresh(true);
    expect(realm.objectForPrimaryKey(Show, showUuid)?.displayDate).toBe('Updated after the move');
    unsubscribe();

    shows = [];
    await detail.refresh(true);
    expect(detail.currentResults().errors).toBeUndefined();
    await vi.waitFor(() => expect(detail.currentResults().data.shows).toEqual([]));
    await detail.refresh();
    expect(validators.every((validator) => validator === null)).toBe(true);
    // Leaving this query does not delete a shared show or its offline state.
    expect(realm.objectForPrimaryKey(Show, showUuid)?.deletedAt).toBeNull();
  });

  it('publishes an empty tour root update from the artist inventory', async () => {
    realm.write(() => seedArtistAndYear(realm));
    let name = 'Empty Tour';
    const api = new RelistenApiClient({
      transport: new CatalogTransport({
        apiBase: 'https://catalog.test/api',
        fetch: async (input) => {
          const tour = { ...tourResource(name), show_count: 0 };
          return new Response(
            JSON.stringify(String(input).includes('/artists/') ? [tour] : { ...tour, shows: [] }),
            { headers: { etag: '"tour"' } }
          );
        },
      }),
    });
    const detail = new TourShowsNetworkBackedBehavior(realm, artistUuid, tourUuid).sharedExecutor(
      api
    );
    const inventory = new ToursNetworkBackedBehavior(realm, artistUuid).sharedExecutor(api);
    executors.push(detail, inventory);
    await detail.refresh();
    await vi.waitFor(() => expect(detail.currentResults().data.tour?.name).toBe('Empty Tour'));
    expect(realm.objects(Show)).toHaveLength(0);
    const observedNames: (string | undefined)[] = [];
    const unsubscribe = detail.start().addListener((result) => {
      observedNames.push(result.data.tour?.name);
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    name = 'Renamed Empty Tour';
    await inventory.refresh();
    await vi.waitFor(() => expect(observedNames).toContain('Renamed Empty Tour'));
    expect(detail.currentResults().data.shows).toEqual([]);
    unsubscribe();
  });

  it('hydrates a cold track favorite with canonical parents without replacing richer recording lists', async () => {
    const capture = { scopeId: 'test-account', generation: 1 };
    realm.write(() => {
      realm.create(UserFavorite, {
        favoriteId: 'test-track-favorite',
        scopeId: capture.scopeId,
        targetKind: 'track',
        targetId: trackAId,
        effectivePresent: true,
        createdAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
      });
    });
    const fullSource = sourceResource(sourceAId, [
      sourceSetResource(setAId, sourceAId, [trackResource(), trackResource({ id: trackBId })]),
    ]);
    const source = { ...fullSource, sets: undefined, links: undefined };
    const set = { ...fullSource.sets[0], tracks: undefined };
    const entities = {
      artists: [],
      years: [yearResource()],
      tours: [],
      imported_venues: [],
      imported_songs: [],
      artist_venues: [artistVenueResource()],
      shows: [showSummaryResource()],
      sources: [source],
      source_sets: [set],
      tracks: [trackResource()],
      venues: [normalizedVenueResource()],
      songs: [normalizedSongDetailResource()],
    };
    const api = new RelistenApiClient({
      transport: new CatalogTransport({
        apiBase: 'https://catalog.test/api',
        fetch: async (input) =>
          new Response(
            JSON.stringify(
              String(input).includes('/catalog/resolve')
                ? {
                    references: [
                      {
                        kind: 'track',
                        scheme: 'v4',
                        id: trackAId,
                        artist_id: null,
                        availability: 'available',
                        target: { kind: 'track', id: trackAId },
                        reason: null,
                      },
                    ],
                    entities,
                  }
                : [artistResource()]
            ),
            { headers: { etag: '"favorite-parents"' } }
          ),
      }),
    });
    const repository = new FavoriteRepository(realm, {
      capture: () => capture,
      isCurrent: (candidate) => candidate === capture,
      subscribe: () => () => {},
    });
    const hydrator = new FavoriteMetadataHydrator(repository, api);
    await hydrator.refresh(capture);
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.show?.uuid).toBe(showUuid);
    expect(
      realm.objectForPrimaryKey(Source, sourceAUuid)?.sourceSets.map((row) => row.uuid)
    ).toEqual([setAUuid]);
    expect(
      realm.objectForPrimaryKey(SourceSet, setAUuid)?.sourceTracks.map((row) => row.uuid)
    ).toEqual([trackAUuid]);
    expect(realm.objectForPrimaryKey(NormalizedVenue, 'venue_00000001')?.name).toBe(
      'Canonical Hall'
    );
    expect(repository.isFavorite({ kind: 'track', id: trackAId })).toBe(true);

    realm.write(() => {
      applyFullSource(realm, fullSource);
      // Force missing metadata without changing the durable favorite.
      realm.objectForPrimaryKey(SourceTrack, trackAUuid)!.deletedAt = new Date();
    });
    await hydrator.refresh(capture);
    expect(
      realm.objectForPrimaryKey(Source, sourceAUuid)?.sourceSets.map((row) => row.uuid)
    ).toEqual([setAUuid]);
    expect(
      realm.objectForPrimaryKey(SourceSet, setAUuid)?.sourceTracks.map((row) => row.uuid)
    ).toEqual([trackAUuid, trackBUuid]);
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.deletedAt).toBeNull();
  });

  it("replaces only one artist's year membership and reactivates retained rows in place", () => {
    const otherArtist: ArtistResource = {
      ...artistResource('Other Artist'),
      id: encodeUuidCatalogId(otherArtistUuid, 'artist'),
      slug: 'other-artist',
      sort_name: 'Other Artist',
    };
    const secondYear = yearResource({ uuid: otherYearUuid, year: '2025' });
    const otherArtistYear = yearResource({
      uuid: otherArtistYearUuid,
      ownerUuid: otherArtistUuid,
      year: '2024',
    });

    const returnedYearIds = realm.write(() => {
      applyArtistList(realm, [artistResource(), otherArtist]);
      const resultIds = applyArtistYears(realm, artistUuid, [yearResource(), secondYear]);
      applyArtistYears(realm, otherArtistUuid, [otherArtistYear]);
      return resultIds;
    });
    expect(returnedYearIds).toEqual([yearUuid, otherYearUuid]);
    const firstYear = realm.objectForPrimaryKey(Year, yearUuid)!;

    realm.write(() => applyArtistYears(realm, artistUuid, [secondYear]));
    expect(realm.objectForPrimaryKey(Year, yearUuid)?.deletedAt).toBeInstanceOf(Date);
    expect(realm.objectForPrimaryKey(Year, otherArtistYearUuid)?.deletedAt).toBeNull();

    realm.write(() => applyArtistYears(realm, artistUuid, [yearResource(), secondYear]));
    expect(firstYear.isValid()).toBe(true);
    expect(firstYear.deletedAt).toBeNull();
  });

  it('counts downloads only while the playable track is linked to its offline record', async () => {
    realm.write(() => {
      seedArtistAndYear(realm);
      applyFullShow(
        realm,
        fullShowResource([
          sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])]),
        ])
      );
      realm.create(SourceTrackOfflineInfo, {
        sourceTrackUuid: trackAUuid,
        status: SourceTrackOfflineInfoStatus.Succeeded,
        type: SourceTrackOfflineInfoType.StreamingCache,
        queuedAt: new Date(timestamp),
      });
    });
    const projection = new OfflineAvailabilityProjection(realm);
    try {
      expect(projection.artistHasPlayableTracks(artistUuid)).toBe(false);
      realm.write(() => {
        const info = realm.objectForPrimaryKey(SourceTrackOfflineInfo, trackAUuid)!;
        realm.objectForPrimaryKey(SourceTrack, trackAUuid)!.offlineInfo = info;
        info.type = SourceTrackOfflineInfoType.UserInitiated;
      });
      await vi.waitFor(() => expect(projection.artistHasLibraryDownloads(artistUuid)).toBe(true));
      expect(projection.yearHasPlayableTracks(yearUuid)).toBe(true);
      expect(projection.showHasPlayableTracks(showUuid)).toBe(true);
      expect(projection.sourceHasPlayableTracks(sourceAUuid)).toBe(true);
      realm.write(() => {
        realm.objectForPrimaryKey(SourceTrackOfflineInfo, trackAUuid)!.type =
          SourceTrackOfflineInfoType.StreamingCache;
      });
      await vi.waitFor(() => expect(projection.artistHasLibraryDownloads(artistUuid)).toBe(false));
      expect(projection.artistHasPlayableTracks(artistUuid)).toBe(true);
    } finally {
      projection.tearDown();
    }
  });

  it("replaces only one year's shows while preserving detail and offline descendants", () => {
    const secondYear = yearResource({ uuid: otherYearUuid, year: '2025' });
    const secondShow = showSummaryResource({
      uuid: otherShowUuid,
      year: secondYear,
      sourceCount: 0,
    });
    const detailedShow = fullShowResource([
      sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])]),
    ]);
    detailedShow.source_count = 1;

    realm.write(() => {
      applyArtistList(realm, [artistResource()]);
      applyArtistYears(realm, artistUuid, [yearResource(), secondYear]);
      applyYearDetail(realm, artistUuid, yearUuid, yearWithShowsResource());
      applyYearDetail(
        realm,
        artistUuid,
        otherYearUuid,
        yearWithShowsResource(secondYear, [secondShow])
      );
      applyFullShow(realm, detailedShow);
      const offlineInfo = realm.create(SourceTrackOfflineInfo, {
        sourceTrackUuid: trackAUuid,
        status: SourceTrackOfflineInfoStatus.Succeeded,
        type: SourceTrackOfflineInfoType.UserInitiated,
        queuedAt: new Date(timestamp),
        startedAt: new Date(timestamp),
        completedAt: new Date(timestamp),
        downloadedBytes: 123,
        totalBytes: 123,
        percent: 1,
      });
      realm.objectForPrimaryKey(SourceTrack, trackAUuid)!.offlineInfo = offlineInfo;
    });
    const firstShow = realm.objectForPrimaryKey(Show, showUuid)!;

    realm.write(() =>
      applyYearDetail(
        realm,
        artistUuid,
        yearUuid,
        yearWithShowsResource(yearResource({ showCount: 0 }), [])
      )
    );

    expect(realm.objectForPrimaryKey(Show, showUuid)?.deletedAt).toBeInstanceOf(Date);
    expect(realm.objectForPrimaryKey(Show, otherShowUuid)?.deletedAt).toBeNull();
    expect(realm.objectForPrimaryKey(Source, sourceAUuid)?.deletedAt).toBeNull();
    expect(realm.objectForPrimaryKey(SourceSet, setAUuid)?.deletedAt).toBeNull();
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.deletedAt).toBeNull();
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.offlineInfo?.downloadedBytes).toBe(
      123
    );

    const returnedShowIds = realm.write(() =>
      applyYearDetail(
        realm,
        artistUuid,
        yearUuid,
        yearWithShowsResource(yearResource(), [showSummaryResource({ sourceCount: 1 })])
      )
    );

    expect(returnedShowIds).toEqual([showUuid]);
    expect(firstShow.isValid()).toBe(true);
    expect(firstShow.deletedAt).toBeNull();
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.offlineInfo?.downloadedBytes).toBe(
      123
    );
  });

  it('repairs shared data and recording membership on a later detail refresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(timestamp));
    realm.write(() => seedArtistAndYear(realm));
    const yearPath = `/artists/${artistId}/years/${encodeUuidCatalogId(yearUuid, 'year')}`;
    const showPath = `/shows/${showId}`;
    const correctedShow = fullShowResource([
      sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])]),
    ]);
    correctedShow.source_count = 1;
    correctedShow.avg_rating = 4.75;
    correctedShow.year = { ...yearResource(), popularity: popularityResource(100) };
    const olderYear = yearWithShowsResource(
      { ...yearResource(), popularity: popularityResource(1) },
      [showSummaryResource({ sourceCount: 1 })]
    );
    olderYear.shows[0].year = { ...yearResource(), popularity: popularityResource(1) };
    let releaseOlderYear: ((response: Response) => void) | undefined;
    const validators: (string | null)[] = [];
    const api = new RelistenApiClient({
      transport: new CatalogTransport({
        apiBase: 'https://catalog.example/api',
        fetch: async (input, init) => {
          const path = new URL(String(input)).pathname.replace('/api/v4', '');
          if (path === yearPath) {
            return new Promise<Response>((resolve) => {
              releaseOlderYear = resolve;
            });
          }
          if (path !== showPath) {
            throw new Error(`Unexpected request ${path}`);
          }
          const validator = new Headers(init?.headers).get('If-None-Match');
          validators.push(validator);
          return validator
            ? new Response(null, { status: 304, headers: { etag: 'W/"show"' } })
            : new Response(JSON.stringify(correctedShow), { headers: { etag: 'W/"show"' } });
        },
      }),
    });
    const year = new YearShowsNetworkBackedBehavior(
      realm,
      artistUuid,
      yearUuid,
      {},
      false
    ).sharedExecutor(api);
    const show = new ShowWithFullSourcesNetworkBackedBehavior(realm, showUuid).sharedExecutor(api);
    executors.push(year, show);
    const pendingYear = year.refresh();
    await vi.waitFor(() => expect(releaseOlderYear).toBeDefined());
    await show.refresh();
    expect(realm.objectForPrimaryKey(Show, showUuid)?.avgRating).toBe(4.75);

    releaseOlderYear!(new Response(JSON.stringify(olderYear), { headers: { etag: 'W/"year"' } }));
    await pendingYear;
    expect(realm.objectForPrimaryKey(Show, showUuid)?.avgRating).toBe(4.5);
    expect(realm.objectForPrimaryKey(Year, yearUuid)?.popularity?.windows.days30d.plays).toBe(1);
    realm.write(() => realm.objectForPrimaryKey(SourceSet, setAUuid)!.sourceTracks.splice(0, 1));

    await show.refresh(true);
    expect(validators).toEqual([null, null]);
    expect(show.currentResults().errors).toBeUndefined();
    expect(realm.objectForPrimaryKey(Show, showUuid)?.avgRating).toBe(4.75);
    expect(realm.objectForPrimaryKey(Year, yearUuid)?.popularity?.windows.days30d.plays).toBe(100);
    expect(
      realm.objectForPrimaryKey(SourceSet, setAUuid)?.sourceTracks.map((track) => track.uuid)
    ).toEqual([trackAUuid]);
  });

  it('rejects duplicate identities and membership from another parent', () => {
    realm.write(() => seedArtistAndYear(realm));

    expect(() =>
      realm.write(() => applyArtistYears(realm, artistUuid, [yearResource(), yearResource()]))
    ).toThrow('contains duplicate identities');

    const foreignYear = yearResource({
      uuid: otherArtistYearUuid,
      ownerUuid: otherArtistUuid,
      year: '2024',
    });
    expect(() => realm.write(() => applyArtistYears(realm, artistUuid, [foreignYear]))).toThrow(
      'inconsistent artist parent'
    );

    const secondYear = yearResource({ uuid: otherYearUuid, year: '2025' });
    expect(() =>
      realm.write(() =>
        applyYearDetail(
          realm,
          artistUuid,
          yearUuid,
          yearWithShowsResource(yearResource(), [showSummaryResource({ year: secondYear })])
        )
      )
    ).toThrow('inconsistent year parent');

    expect(realm.objectForPrimaryKey(Year, otherArtistYearUuid)).toBeNull();
    expect(realm.objectForPrimaryKey(Year, otherYearUuid)).toBeNull();
    expect(realm.objectForPrimaryKey(Year, yearUuid)?.deletedAt).toBeNull();
  });

  it('replaces full-show child membership while retaining tombstoned rows and offline state', () => {
    const trackA = trackResource();
    const trackB = trackResource({ id: trackBId, title: 'Offline Track' });
    const trackC = trackResource({
      id: trackCId,
      setId: setBId,
      title: 'Omitted Set Track',
    });
    const sourceBTrack = trackResource({
      id: encodeUuidCatalogId('00000000-0000-4000-8000-00000000000e', 'track'),
      sourceId: sourceBId,
      setId: encodeUuidCatalogId('00000000-0000-4000-8000-00000000000f', 'source_set'),
    });
    const sourceBSet = sourceSetResource(sourceBTrack.source_set_id, sourceBId, [sourceBTrack]);

    realm.write(() => {
      seedArtistAndYear(realm);
      applyFullShow(
        realm,
        fullShowResource([
          sourceResource(sourceAId, [
            sourceSetResource(setAId, sourceAId, [trackA, trackB]),
            sourceSetResource(setBId, sourceAId, [trackC]),
          ]),
          sourceResource(sourceBId, [sourceBSet]),
        ])
      );
      const offlineInfo = realm.create(SourceTrackOfflineInfo, {
        sourceTrackUuid: trackBUuid,
        status: SourceTrackOfflineInfoStatus.Succeeded,
        type: SourceTrackOfflineInfoType.UserInitiated,
        queuedAt: new Date(timestamp),
        startedAt: new Date(timestamp),
        completedAt: new Date(timestamp),
        downloadedBytes: 123,
        totalBytes: 123,
        percent: 1,
      });
      realm.objectForPrimaryKey(SourceTrack, trackBUuid)!.offlineInfo = offlineInfo;
    });

    realm.write(() => {
      applyFullShow(
        realm,
        fullShowResource([
          sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])]),
        ])
      );
    });

    const sourceA = realm.objectForPrimaryKey(Source, sourceAUuid)!;
    const sourceB = realm.objectForPrimaryKey(Source, sourceBUuid)!;
    const setA = realm.objectForPrimaryKey(SourceSet, setAUuid)!;
    const setB = realm.objectForPrimaryKey(SourceSet, setBUuid)!;
    const offlineTrack = realm.objectForPrimaryKey(SourceTrack, trackBUuid)!;
    expect(sourceA.sourceSets.map((set) => set.uuid)).toEqual([setAUuid]);
    expect(setA.sourceTracks.map((track) => track.uuid)).toEqual([trackAUuid]);
    expect(sourceB.deletedAt).toBeInstanceOf(Date);
    expect(setB.deletedAt).toBeInstanceOf(Date);
    expect(offlineTrack.deletedAt).toBeInstanceOf(Date);
    expect(offlineTrack.offlineInfo?.status).toBe(SourceTrackOfflineInfoStatus.Succeeded);
    expect(offlineTrack.offlineInfo?.downloadedBytes).toBe(123);
  });

  it('moves an existing track between returned sets without tombstoning or duplicating it', () => {
    const trackB = trackResource({ id: trackBId, title: 'Second Track' });
    realm.write(() => {
      seedArtistAndYear(realm);
      applyFullShow(
        realm,
        fullShowResource([
          sourceResource(sourceAId, [
            sourceSetResource(setAId, sourceAId, [trackResource()]),
            sourceSetResource(setBId, sourceAId, [{ ...trackB, source_set_id: setBId }]),
          ]),
        ])
      );
    });

    const movedTrack = trackResource({ setId: setBId });
    realm.write(() => {
      // The new set comes first so a one-pass implementation would later tombstone
      // the same managed row while processing its old set.
      applyFullSource(
        realm,
        sourceResource(sourceAId, [
          sourceSetResource(setBId, sourceAId, [movedTrack]),
          sourceSetResource(setAId, sourceAId, []),
        ])
      );
    });

    const track = realm.objectForPrimaryKey(SourceTrack, trackAUuid)!;
    const setA = realm.objectForPrimaryKey(SourceSet, setAUuid)!;
    const setB = realm.objectForPrimaryKey(SourceSet, setBUuid)!;
    expect(track.deletedAt).toBeNull();
    expect(track.sourceSetUuid).toBe(setBUuid);
    expect(setA.sourceTracks.map((candidate) => candidate.uuid)).toEqual([]);
    expect(setB.sourceTracks.map((candidate) => candidate.uuid)).toEqual([trackAUuid]);
  });

  it('builds a complete playable graph for a valid yearless show', () => {
    const yearlessShow = fullShowResource([
      sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])]),
    ]);
    yearlessShow.year_id = null;
    yearlessShow.year = null;

    realm.write(() => {
      applyArtistList(realm, [artistResource()]);
      applyFullShow(realm, yearlessShow);
    });

    const track = realm.objectForPrimaryKey(SourceTrack, trackAUuid)!;
    expect(track.artist.uuid).toBe(artistUuid);
    expect(track.show.uuid).toBe(showUuid);
    expect(track.source.uuid).toBe(sourceAUuid);
    expect(track.year).toBeNull();
  });

  it('tombstones omitted artists and reactivates an unchanged returned row in place', () => {
    const otherArtist: ArtistResource = {
      ...artistResource('Other Artist'),
      id: encodeUuidCatalogId(otherArtistUuid, 'artist'),
      slug: 'other-artist',
      sort_name: 'Other Artist',
    };

    realm.write(() => applyArtistList(realm, [artistResource(), otherArtist]));
    const firstArtist = realm.objectForPrimaryKey(Artist, otherArtistUuid)!;
    realm.write(() => applyArtistList(realm, [artistResource()]));
    expect(realm.objectForPrimaryKey(Artist, otherArtistUuid)?.deletedAt).toBeInstanceOf(Date);

    realm.write(() => applyArtistList(realm, [otherArtist]));
    expect(firstArtist.isValid()).toBe(true);
    expect(firstArtist.updatedAt.toISOString()).toBe(timestamp);
    expect(firstArtist.deletedAt).toBeNull();
    expect(realm.objectForPrimaryKey(Artist, artistUuid)?.deletedAt).toBeInstanceOf(Date);
  });

  it('rolls back graph changes when a required parent is inconsistent', () => {
    realm.write(() => {
      seedArtistAndYear(realm);
      applyFullShow(
        realm,
        fullShowResource([
          sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])]),
        ])
      );
    });

    const invalidSource = sourceResource(sourceBId, []);
    invalidSource.show_id = encodeUuidCatalogId(otherShowUuid, 'show');
    const changedShow = fullShowResource([
      sourceResource(sourceAId, [
        sourceSetResource(setAId, sourceAId, [trackResource({ title: 'Must Roll Back' })]),
      ]),
      invalidSource,
    ]);
    changedShow.display_date = 'Changed but rolled back';

    expect(() => {
      realm.write(() => applyFullShow(realm, changedShow));
    }).toThrow(CatalogApplyError);

    expect(realm.objectForPrimaryKey(Show, showUuid)?.displayDate).toBe('2026-10-31');
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.title).toBe('Imported Track Title');
    expect(realm.objectForPrimaryKey(Source, sourceBUuid)).toBeNull();
  });
  it('shares cold artist prerequisites and applies dependent years after their owner', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/artists?'))
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      return new Response(JSON.stringify([yearResource()]), { headers: { etag: '"years"' } });
    });
    const api = new RelistenApiClient({
      transport: new CatalogTransport({ apiBase: 'https://catalog.test/api', fetch }),
    });
    const executor = yearsNetworkBackedModelArrayBehavior(
      realm,
      false,
      artistUuid,
      false
    ).sharedExecutor(api);
    executors.push(executor);
    const years = executor.refresh();
    const prerequisite = ensureCatalogArtist(realm, api, artistUuid);
    finish(new Response(JSON.stringify([artistResource()]), { headers: { etag: '"artists"' } }));
    await Promise.all([years, prerequisite]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(executor.currentResults().errors).toBeUndefined();
    expect(executor.currentResults().data[0].artistUuid).toBe(artistUuid);
  });

  it('learns detail redirects and rejects cyclic resolver changes atomically', () => {
    realm.write(() => {
      seedArtistAndYear(realm);
      applySongDetail(
        realm,
        artistUuid,
        { ...normalizedSongDetailResource(), shows: [] },
        'song_00000004'
      );
    });
    expect(new CatalogIdentity(realm.objects(CatalogRedirect)).resolve('song_00000004')).toBe(
      'song_00000003'
    );
    realm.write(() =>
      applySongDetail(
        realm,
        artistUuid,
        { ...normalizedSongDetailResource('song_00000005'), shows: [] },
        'song_00000003'
      )
    );
    expect(new CatalogIdentity(realm.objects(CatalogRedirect)).resolve('song_00000004')).toBe(
      'song_00000005'
    );
    expect(() =>
      realm.write(() => {
        realm.objectForPrimaryKey(NormalizedSong, 'song_00000005')!.name = 'Must roll back';
        applyCatalogResolutions(realm, [
          {
            kind: 'song',
            scheme: 'v4',
            id: 'song_00000005',
            artist_id: null,
            availability: 'redirected',
            target: { kind: 'song', id: 'song_00000004' },
            reason: null,
          },
        ]);
      })
    ).toThrow('cycle');
    expect(realm.objectForPrimaryKey(NormalizedSong, 'song_00000005')?.name).toBe('Canonical Song');
    expect(new CatalogIdentity(realm.objects(CatalogRedirect)).resolve('song_00000004')).toBe(
      'song_00000005'
    );
  });
  it('keeps cached venue detail after browse pruning but starts song discovery without cached membership', () => {
    realm.write(() => {
      seedArtistAndYear(realm);
      applyYearDetail(realm, artistUuid, yearUuid, yearWithShowsResource());
      applyArtistSongs(realm, artistUuid, [
        { kind: 'imported_song', song: null, imported_song: importedSongResource() },
      ]);
      realm
        .objectForPrimaryKey(Song, importedSongUuid)!
        .shows.add(realm.objectForPrimaryKey(Show, showUuid)!);
      applyArtistVenues(realm, artistUuid, []);
    });
    hookRealm.current = realm;
    const song = useSongShows(artistUuid, importedSongUuid);
    expect(song.data.shows).toEqual([]);
    expect(song.data.isAvailable).toBe(false);
    const venue = useVenueShows(artistUuid, importedVenueUuid);
    expect(venue.data.venue?.name).toBe('Imported Hall');
    expect(venue.data.shows.map((row) => row.uuid)).toEqual([showUuid]);
    expect(useVenues(artistUuid).data).toEqual([]);
    expect(realm.objectForPrimaryKey(Song, importedSongUuid)!.shows).toHaveLength(1);
  });

  it.each(['artist', 'global'] as const)(
    'preserves first-load errors in the %s venue screen when only metadata is cached',
    async (kind) => {
      vi.stubGlobal('React', await vi.importActual('react'));
      realm.write(() => {
        seedArtistAndYear(realm);
        applyArtistVenues(realm, artistUuid, [
          { kind: 'artist_venue', artist_venue: artistVenueResource(), imported_venue: null },
        ]);
      });
      const api = new RelistenApiClient({
        transport: new CatalogTransport({
          apiBase: 'https://venue.test/api',
          fetch: async () => new Response('missing', { status: 404 }),
        }),
      });
      const executor = new VenueShowsNetworkBackedBehavior(
        realm,
        kind === 'artist' ? artistUuid : undefined,
        'venue_00000001'
      ).sharedExecutor(api);
      executors.push(executor);
      await executor.refresh();
      const results = executor.currentResults();
      expect(results.data.venue?.showCount).toBeGreaterThan(0);
      expect(results.data.shows).toEqual([]);
      expect(results.errors).toHaveLength(1);
      venuePageState.results =
        kind === 'artist'
          ? {
              ...results,
              data: { venue: results.data, artist: realm.objectForPrimaryKey(Artist, artistUuid) },
            }
          : results;

      // Exercise the actual page's handoff to the shared error-rendering context.
      const page = (
        kind === 'artist' ? ArtistVenueDetailPage() : GlobalVenueDetailPage()
      ) as ReactElement<{
        children: ReactElement<{ networkBackedResults: NetworkBackedResults<unknown> }>;
      }>;
      expect(page.props.children.props.networkBackedResults.errors).toEqual(results.errors);
    }
  );

  it('keeps cached browse aliases in My Library filters after a catalog merge', async () => {
    const a = 'song_00000004';
    const b = 'song_00000003';
    realm.write(() => {
      seedArtistAndYear(realm);
      realm.create(NormalizedSong, { id: a, name: 'Old song', artistUuid });
      realm.create(UserFavorite, {
        favoriteId: 'cached-favorite',
        scopeId: 'anonymous',
        targetKind: 'song',
        targetId: a,
        effectivePresent: true,
        acknowledgedPresent: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
    const scope = {
      capture: () => ({ scopeId: 'anonymous', generation: 1 }),
      isCurrent: () => true,
      subscribe: () => () => {},
    };
    const index = new LibraryIndex(realm, scope);
    try {
      expect(index.isFavorite('song', a)).toBe(true);
      expect(index.favoriteCatalogUuids('song')).toEqual(new Set([a]));
      realm.write(() =>
        applySongDetail(realm, artistUuid, { ...normalizedSongDetailResource(), shows: [] }, a)
      );
      await vi.waitFor(() => expect(index.isFavorite('song', b)).toBe(true));
      expect(index.favoriteCatalogUuids('song')).toEqual(new Set([b]));
      expect(index.isFavorite('song', a)).toBe(true);
    } finally {
      index.tearDown();
    }
  });
  it('keeps a newer show response when an older response finishes preparing its artist', async () => {
    let finishArtists!: (response: Response) => void;
    let showRequests = 0;
    const olderBody = { ...fullShowResource([]), source_count: 0, display_date: 'Old date' };
    const newerBody = { ...fullShowResource([]), source_count: 0, display_date: 'New date' };
    const api = new RelistenApiClient({
      transport: new CatalogTransport({
        apiBase: 'https://review.test/api',
        fetch: async (input) => {
          if (String(input).includes('/artists'))
            return new Promise<Response>((resolve) => {
              finishArtists = resolve;
            });
          showRequests++;
          return new Response(JSON.stringify(showRequests === 1 ? olderBody : newerBody));
        },
      }),
    });
    const oldExecutor = new ShowWithFullSourcesNetworkBackedBehavior(
      realm,
      showUuid
    ).sharedExecutor(api);
    executors.push(oldExecutor);
    const old = oldExecutor.refresh();
    await vi.waitFor(() => expect(finishArtists).toBeDefined());
    // A different catalog response can make the same required artist available while bootstrap is waiting.
    realm.write(() => applyArtistList(realm, [artistResource()]));
    const newExecutor = new ShowWithFullSourcesNetworkBackedBehavior(
      realm,
      showUuid
    ).sharedExecutor(api);
    executors.push(newExecutor);
    await newExecutor.refresh(true);
    expect(realm.objectForPrimaryKey(Show, showUuid)?.displayDate).toBe('New date');
    finishArtists(new Response(JSON.stringify([artistResource()])));
    await old;
    expect(realm.objectForPrimaryKey(Show, showUuid)?.displayDate).toBe('New date');
  });
});
