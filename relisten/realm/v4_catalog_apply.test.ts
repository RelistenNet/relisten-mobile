/// <reference types="node" />
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
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
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@/relisten/api/context', () => ({}));
vi.mock('@/relisten/realm/schema', () => ({}));
vi.mock('@/relisten/realm/root_services', () => ({}));
vi.mock('@/relisten/util/routes', () => ({}));
vi.mock('@/relisten/realm/network_backed_behavior_hooks', () => ({}));

import { RelistenApiClient } from '@/relisten/api/client';
import { encodeV4UuidCatalogId } from '@/relisten/api/v4/catalog_identity';
import { CatalogV4Transport } from '@/relisten/api/v4/catalog_transport';
import type {
  V4ArtistFeaturesResource,
  V4ArtistResource,
  V4ArtistSongEntryResource,
  V4ArtistVenueEntryResource,
  V4ArtistVenueResource,
  V4ImportedSongResource,
  V4ImportedVenueResource,
  V4ShowResource,
  V4ShowSummaryResource,
  V4SongDetailResource,
  V4SourceResource,
  V4SourceSetResource,
  V4TrackNormalizationResource,
  V4TrackResource,
  V4VenueResource,
  V4YearResource,
  V4YearWithShowsResource,
} from '@/relisten/api/v4/wire_types';
import { Artist } from '@/relisten/realm/models/artist';
import { ArtistFeaturedFlags } from '@/relisten/realm/models/artist';
import { artistsNetworkBackedBehavior } from './models/artist_repo';
import { ArtistSongsNetworkBackedBehavior } from './models/song_repo';
import {
  Popularity,
  PopularityWindow,
  PopularityWindows,
} from '@/relisten/realm/models/popularity';
import { Show } from '@/relisten/realm/models/show';
import { Song } from '@/relisten/realm/models/song';
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
  CatalogQueryState,
  NormalizedSong,
  NormalizedVenue,
  V4_CATALOG_REALM_MODELS,
} from '@/relisten/realm/models/v4_catalog';
import { Venue } from '@/relisten/realm/models/venue';
import { Year } from '@/relisten/realm/models/year';
import {
  applyV4ArtistList,
  applyV4ArtistSongs,
  applyV4ArtistVenue,
  applyV4ArtistVenues,
  applyV4ArtistYears,
  applyV4FullShow,
  applyV4FullSource,
  applyV4ImportedSong,
  applyV4ImportedVenue,
  applyV4Song,
  applyV4SongTracks,
  applyV4Track,
  applyV4Venue,
  applyV4Year,
  hasV4ArtistSongs,
  hasV4ArtistVenue,
  hasV4ArtistVenues,
  hasV4ArtistYears,
  hasV4ImportedSong,
  hasV4ImportedVenue,
  hasV4Show,
  hasV4Song,
  hasV4SongTracks,
  hasV4Source,
  hasV4Track,
  hasV4Venue,
  hasV4Year,
  V4CatalogApplyError,
} from '@/relisten/realm/v4_catalog_apply';
import { ShowWithFullSourcesNetworkBackedBehavior } from './models/show_repo';
import { SongShowsNetworkBackedBehavior } from './models/shows/song_shows_repo';
import { VenueShowsNetworkBackedBehavior } from './models/shows/venue_shows_repo';
import { SongTracksNetworkBackedBehavior } from './models/song_tracks_repo';
import { ArtistVenuesNetworkBackedBehavior } from './models/venue_repo';
import { YearShowsNetworkBackedBehavior } from './models/year_repo';
import { ToursNetworkBackedBehavior } from './models/tour_repo';
import { TourShowsNetworkBackedBehavior } from './models/shows/tour_shows_repo';
import { FavoriteMetadataHydrator } from '../library/favorite_metadata_hydrator';
import { FavoriteRepository } from '../library/favorite_repository';
import { UserFavorite } from './models/library';

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

const artistId = encodeV4UuidCatalogId(artistUuid, 'artist');
const showId = encodeV4UuidCatalogId(showUuid, 'show');
const importedVenueId = encodeV4UuidCatalogId(importedVenueUuid, 'imported_venue');
const sourceAId = encodeV4UuidCatalogId(sourceAUuid, 'source');
const sourceBId = encodeV4UuidCatalogId(sourceBUuid, 'source');
const setAId = encodeV4UuidCatalogId(setAUuid, 'source_set');
const setBId = encodeV4UuidCatalogId(setBUuid, 'source_set');
const trackAId = encodeV4UuidCatalogId(trackAUuid, 'track');
const trackBId = encodeV4UuidCatalogId(trackBUuid, 'track');
const trackCId = encodeV4UuidCatalogId(trackCUuid, 'track');
const importedSongId = encodeV4UuidCatalogId(importedSongUuid, 'imported_song');

const features: V4ArtistFeaturesResource = {
  descriptions: true,
  eras: true,
  multiple_sources: true,
  reviews: true,
  ratings: true,
  tours: true,
  taper_notes: true,
  source_information: true,
  sets: true,
  per_show_venues: true,
  per_source_venues: true,
  venue_coords: true,
  songs: true,
  years: true,
  track_md5s: true,
  review_titles: true,
  jam_charts: true,
  setlist_data_incomplete: false,
  track_names: true,
  venue_past_names: true,
  reviews_have_ratings: true,
  track_durations: true,
  can_have_flac: true,
  normalization: true,
};

function artistResource(name = 'Test Artist'): V4ArtistResource {
  return {
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
} = {}): V4YearResource {
  return {
    id: encodeV4UuidCatalogId(uuid, 'year'),
    artist_id: encodeV4UuidCatalogId(ownerUuid, 'artist'),
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

function normalizedVenueResource(name = 'Canonical Hall'): V4VenueResource {
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

function artistVenueResource(name = 'Canonical Hall'): V4ArtistVenueResource {
  return {
    id: 'artist_venue_00000002',
    artist_id: artistId,
    artist_show_count: 4,
    created_at: timestamp,
    updated_at: timestamp,
    venue: normalizedVenueResource(name),
  };
}

function importedVenueResource(name = 'Imported Hall'): V4ImportedVenueResource {
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

function normalizedSongDetailResource(
  id: V4SongDetailResource['id'] = 'song_00000003'
): V4SongDetailResource {
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

function importedSongResource(name = 'Imported Song'): V4ImportedSongResource {
  return {
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
  year?: V4YearResource;
  sourceCount?: number;
} = {}): V4ShowSummaryResource {
  return {
    id: encodeV4UuidCatalogId(uuid, 'show'),
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
  qualifiers: V4TrackNormalizationResource['parts'][number]['qualifiers'] = []
): V4TrackNormalizationResource {
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
  id?: V4TrackResource['id'];
  sourceId?: V4TrackResource['source_id'];
  setId?: V4TrackResource['source_set_id'];
  title?: string;
  trackNormalization?: V4TrackNormalizationResource;
} = {}): V4TrackResource {
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
  id: V4SourceSetResource['id'],
  sourceId: V4SourceSetResource['source_id'],
  tracks: V4TrackResource[]
): V4SourceSetResource {
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

function sourceResource(id: V4SourceResource['id'], sets: V4SourceSetResource[]): V4SourceResource {
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

function fullShowResource(sources: V4SourceResource[]): V4ShowResource {
  return { ...showSummaryResource(), sources };
}

function yearWithShowsResource(
  year = yearResource(),
  shows: V4ShowSummaryResource[] = [showSummaryResource({ year })]
): V4YearWithShowsResource {
  return { ...year, shows };
}

function seedArtistAndYear(realm: Realm) {
  applyV4ArtistList(realm, [artistResource()]);
  applyV4ArtistYears(realm, artistUuid, [yearResource()]);
}

describe('v4 catalog Realm apply', () => {
  let directory: string;
  let realm: Realm;
  let executors: { tearDown(): void }[];

  beforeEach(async () => {
    executors = [];
    directory = mkdtempSync(join(tmpdir(), 'relisten-v4-catalog-apply-'));
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
        UserFavorite,
        Popularity,
        PopularityWindows,
        PopularityWindow,
        ...V4_CATALOG_REALM_MODELS,
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
      applyV4FullShow(
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
      applyV4Track(realm, correctedTrack);
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
    const venues: V4ArtistVenueEntryResource[] = [
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
    const songs: V4ArtistSongEntryResource[] = [
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
      applyV4ArtistList(realm, [artistResource()]);
      return [
        applyV4ArtistVenues(realm, artistUuid, venues),
        applyV4ArtistSongs(realm, artistUuid, songs),
      ];
    });

    expect(venueIds).toEqual(['artist_venue_00000002', importedVenueId]);
    expect(songIds).toEqual(['song_00000003', importedSongId]);
    expect(hasV4ArtistVenues(realm, artistUuid, venueIds)).toBe(true);
    expect(hasV4ArtistSongs(realm, artistUuid, songIds)).toBe(true);
    expect(realm.objectForPrimaryKey(Song, importedSongUuid)?.name).toBe('');

    expect(() =>
      realm.write(() => applyV4ArtistSongs(realm, artistUuid, [songs[0], songs[0]]))
    ).toThrow('contains duplicate identities');
    expect(() =>
      realm.write(() =>
        applyV4ArtistVenues(realm, artistUuid, [
          {
            kind: 'artist_venue',
            artist_venue: null,
            imported_venue: null,
          } as unknown as V4ArtistVenueEntryResource,
        ])
      )
    ).toThrow('inconsistent kind and target');
  });

  it('keeps venue and song detail memberships independent, including empty results', () => {
    const show = showSummaryResource({ sourceCount: 0 });
    const artistVenue = artistVenueResource();
    const canonicalSong = normalizedSongDetailResource();
    const importedSong = importedSongResource();

    const resultIds = realm.write(() => {
      seedArtistAndYear(realm);
      return {
        artistVenue: applyV4ArtistVenue(realm, artistUuid, {
          ...artistVenue,
          shows: [show],
        }),
        importedVenue: applyV4ImportedVenue(realm, artistUuid, {
          ...importedVenueResource(),
          shows: [show],
        }),
        venue: applyV4Venue(realm, {
          ...normalizedVenueResource(),
          shows: [show],
        }),
        song: applyV4Song(realm, artistUuid, {
          ...canonicalSong,
          shows: [show],
        }),
        importedSong: applyV4ImportedSong(realm, artistUuid, {
          ...importedSong,
          shows: [show],
        }),
      };
    });

    expect(hasV4ArtistVenue(realm, artistUuid, resultIds.artistVenue)).toBe(true);
    expect(hasV4ImportedVenue(realm, artistUuid, resultIds.importedVenue)).toBe(true);
    expect(hasV4Venue(realm, resultIds.venue)).toBe(true);
    expect(hasV4Song(realm, artistUuid, resultIds.song)).toBe(true);
    expect(hasV4ImportedSong(realm, artistUuid, resultIds.importedSong)).toBe(true);
    expect(realm.objectForPrimaryKey(Song, importedSongUuid)?.shows.size).toBe(1);

    const emptyResult = realm.write(() =>
      applyV4Song(realm, artistUuid, { ...canonicalSong, shows: [] })
    );
    expect(emptyResult).toEqual([canonicalSong.id]);
    expect(hasV4Song(realm, artistUuid, emptyResult)).toBe(true);
    expect(realm.objectForPrimaryKey(Show, showUuid)?.deletedAt).toBeNull();
    expect(realm.objectForPrimaryKey(Song, importedSongUuid)?.shows.size).toBe(1);
  });

  it('retains auto-created artists from the complete response while applying screen visibility locally', async () => {
    const ordinary = artistResource();
    const automatic = {
      ...artistResource('Automatic Artist'),
      id: encodeV4UuidCatalogId(otherArtistUuid, 'artist'),
      featured: ArtistFeaturedFlags.AutoCreated,
    };
    realm.write(() => applyV4ArtistList(realm, [automatic]));
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const includeAutomatic =
        new URL(String(input)).searchParams.get('include_autocreated') === 'true';
      return new Response(JSON.stringify(includeAutomatic ? [ordinary, automatic] : [ordinary]), {
        headers: { etag: '"artists"' },
      });
    });
    const api = new RelistenApiClient({
      transport: new CatalogV4Transport({ apiBase: 'https://catalog.test/api', fetch }),
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
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('loads mixed lists and every venue/song detail through the API into repository-owned membership', async () => {
    realm.write(() => seedArtistAndYear(realm));
    const venue = artistVenueResource();
    const song = normalizedSongDetailResource();
    const show = showSummaryResource();
    const responses = new Map<string, object>([
      ['/artists', [artistResource()]],
      [
        `/artists/${artistId}/venues`,
        [
          { kind: 'artist_venue', artist_venue: venue, imported_venue: null },
          { kind: 'imported_venue', artist_venue: null, imported_venue: importedVenueResource() },
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
      [`/songs/${song.id}`, { ...song, shows: [show] }],
      [`/imported-songs/${importedSongId}`, { ...importedSongResource(), shows: [show] }],
      [`/songs/${song.id}/tracks`, { ...song, tracks: [trackResource()] }],
    ]);
    const api = new RelistenApiClient({
      transport: new CatalogV4Transport({
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
        ids: [venue.id, importedVenueId],
      },
      {
        repo: new ArtistSongsNetworkBackedBehavior(realm, artistUuid),
        ids: [song.id, importedSongId],
      },
      {
        repo: new VenueShowsNetworkBackedBehavior(
          realm,
          'artist_venue',
          artistUuid,
          venue.venue.id
        ),
        ids: [venue.id, showId],
      },
      {
        repo: new VenueShowsNetworkBackedBehavior(realm, 'venue', undefined, venue.venue.id),
        ids: [venue.venue.id, showId],
      },
      {
        repo: new VenueShowsNetworkBackedBehavior(
          realm,
          'imported_venue',
          artistUuid,
          importedVenueUuid
        ),
        ids: [importedVenueId, showId],
      },
      {
        repo: new SongShowsNetworkBackedBehavior(realm, artistUuid, song.id, 'song'),
        ids: [song.id, showId],
      },
      {
        repo: new SongShowsNetworkBackedBehavior(
          realm,
          artistUuid,
          importedSongUuid,
          'imported_song'
        ),
        ids: [importedSongId, showId],
      },
      {
        repo: new SongTracksNetworkBackedBehavior(realm, artistUuid, song.id),
        ids: [song.id, trackAId],
      },
    ];

    for (const { repo, ids } of cases) {
      const executor = repo.sharedExecutor(api);
      executors.push(executor);
      await executor.refresh();
      expect(executor.currentResults().errors).toBeUndefined();
      const state = realm.objectForPrimaryKey(CatalogQueryState, repo.queryKey)!;
      expect([...state.resultIds]).toEqual(ids);
      expect(state.hasAppliedData).toBe(true);
    }
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.title).toBe('Imported Track Title');
  });

  it('applies shallow song tracks without taking source, set, or offline ownership', () => {
    const fullShow = fullShowResource([
      sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])]),
    ]);
    fullShow.source_count = 1;

    realm.write(() => {
      seedArtistAndYear(realm);
      applyV4FullShow(realm, fullShow);
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
      for (const key of [
        `GET /shows/${showId}`,
        `GET /sources/${sourceAId}`,
        `GET /source-tracks/${trackAId}`,
      ]) {
        realm.create(CatalogQueryState, {
          key,
          etag: 'W/"detail"',
          hasAppliedData: true,
          retryPending: false,
          resultIds: [],
        });
      }
      for (const [key, resultIds] of [
        [`GET /songs/song_00000003`, ['song_00000003', showId]],
        [`GET /songs/song_00000003/tracks`, ['song_00000003', trackAId]],
      ] as const) {
        realm.create(CatalogQueryState, {
          key,
          etag: 'W/"song-detail"',
          hasAppliedData: true,
          lastAppliedAt: new Date(timestamp),
          lastCheckedAt: new Date(timestamp),
          retryPending: false,
          resultIds: [...resultIds],
        });
      }
    });

    const correctedTrack = trackResource({ title: 'Corrected Imported Title' });
    const resultIds = realm.write(() =>
      applyV4SongTracks(realm, artistUuid, {
        ...normalizedSongDetailResource(),
        tracks: [correctedTrack],
      })
    );

    const track = realm.objectForPrimaryKey(SourceTrack, trackAUuid)!;
    expect(resultIds).toEqual(['song_00000003', trackAId]);
    expect(hasV4SongTracks(realm, artistUuid, resultIds)).toBe(true);
    expect(track.title).toBe('Corrected Imported Title');
    expect(track.offlineInfo?.downloadedBytes).toBe(123);
    expect(track.source?.uuid).toBe(sourceAUuid);
    expect(realm.objectForPrimaryKey(SourceSet, setAUuid)?.sourceTracks[0].uuid).toBe(trackAUuid);
    expect(realm.objectForPrimaryKey(CatalogQueryState, `GET /shows/${showId}`)).toBeNull();
    expect(realm.objectForPrimaryKey(CatalogQueryState, `GET /sources/${sourceAId}`)).toBeNull();
    expect(
      realm.objectForPrimaryKey(CatalogQueryState, `GET /source-tracks/${trackAId}`)
    ).toBeNull();
    for (const key of ['GET /songs/song_00000003', 'GET /songs/song_00000003/tracks']) {
      const state = realm.objectForPrimaryKey(CatalogQueryState, key)!;
      expect(state.etag).toBeNull();
      expect(state.lastCheckedAt).toBeNull();
      expect(Array.from(state.resultIds)).toEqual(
        key.endsWith('/tracks') ? ['song_00000003', trackAId] : ['song_00000003', showId]
      );
    }
  });

  it('loads cold song recordings and keeps warm detail fresh while repairing shared metadata', async () => {
    realm.write(() => applyV4ArtistList(realm, [artistResource()]));
    const songId = 'song_00000003';
    const songPath = `/songs/${songId}`;
    const tracksPath = `${songPath}/tracks`;
    const matchedTrack = trackResource();
    matchedTrack.normalization.parts[0].song!.kind = 'song';
    const songPayload = {
      ...normalizedSongDetailResource(),
      shows: [showSummaryResource({ sourceCount: 0 })],
    };
    const tracksPayload = {
      ...normalizedSongDetailResource(),
      tracks: [matchedTrack],
    };
    let songRequests = 0;
    let trackRequests = 0;
    const transport = new CatalogV4Transport({
      apiBase: 'https://catalog.example/api',
      fetch: async (input) => {
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
    const song = new SongShowsNetworkBackedBehavior(
      realm,
      artistUuid,
      songId,
      'song'
    ).sharedExecutor(api);
    const tracks = new SongTracksNetworkBackedBehavior(realm, artistUuid, songId).sharedExecutor(
      api
    );
    executors.push(song, tracks);

    expect(realm.objects(Show)).toHaveLength(0);
    await tracks.refresh();
    expect(tracks.currentResults().errors).toBeUndefined();
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.show?.uuid).toBe(showUuid);
    await song.refresh();
    await tracks.refresh();
    expect([songRequests, trackRequests]).toEqual([1, 1]);

    realm.write(() =>
      applyV4ArtistSongs(realm, artistUuid, [
        {
          kind: 'song',
          song: { ...normalizedSongDetailResource(), name: 'Older Canonical Song' },
          imported_song: null,
        },
      ])
    );
    for (const key of [`GET ${songPath}`, `GET ${tracksPath}`]) {
      const state = realm.objectForPrimaryKey(CatalogQueryState, key)!;
      expect(state.hasAppliedData).toBe(true);
      expect(state.resultIds.length).toBeGreaterThan(0);
      expect(state.etag).toBeNull();
      expect(state.lastCheckedAt).toBeNull();
    }

    await tracks.refresh();
    await tracks.refresh();

    expect([songRequests, trackRequests]).toEqual([2, 2]);
    expect(realm.objectForPrimaryKey(NormalizedSong, songId)?.name).toBe('Canonical Song');
  });

  it('repairs tour metadata overwritten by inventory and retains complete empty membership', async () => {
    realm.write(() => seedArtistAndYear(realm));
    const tourUuid = '00000000-0000-4000-8000-000000000020';
    const tourId = encodeV4UuidCatalogId(tourUuid, 'tour');
    const tour = {
      id: tourId,
      artist_id: artistId,
      name: 'Corrected Tour',
      slug: 'tour',
      upstream_identifier: 'tour',
      show_count: 1,
      start_date: null,
      end_date: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    let shows = [{ ...showSummaryResource(), tour_id: tourId, tour }];
    const validators: (string | null)[] = [];
    const api = new RelistenApiClient({
      transport: new CatalogV4Transport({
        apiBase: 'https://catalog.test/api',
        fetch: async (input, options) => {
          if (String(input).includes('/artists/')) {
            return new Response(JSON.stringify([{ ...tour, name: 'Old Tour' }]), {
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
    executors.push(detail, inventory);
    await detail.refresh();
    await vi.waitFor(() => expect(detail.currentResults().data.shows).toHaveLength(1));
    await inventory.refresh();
    expect(realm.objectForPrimaryKey(Tour, tourUuid)?.name).toBe('Old Tour');
    expect(detail.currentResults().data.shows.map((show) => show.uuid)).toEqual([showUuid]);

    await detail.refresh();
    await detail.refresh();
    expect(validators).toEqual([null, null]);
    expect(detail.currentResults().data.tour?.name).toBe('Corrected Tour');

    shows = [];
    await detail.refresh(true);
    expect(detail.currentResults().errors).toBeUndefined();
    await vi.waitFor(() => expect(detail.currentResults().data.shows).toEqual([]));
    expect(detail.currentResults().data.hasAppliedData).toBe(true);
    // Leaving this query does not delete a shared show or its offline state.
    expect(realm.objectForPrimaryKey(Show, showUuid)?.deletedAt).toBeNull();
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
      transport: new CatalogV4Transport({
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
    await hydrator.hydrateMissing(capture);
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.show?.uuid).toBe(showUuid);
    expect(realm.objectForPrimaryKey(NormalizedVenue, 'venue_00000001')?.name).toBe(
      'Canonical Hall'
    );
    expect(repository.isFavorite({ kind: 'track', id: trackAId })).toBe(true);
    expect(realm.objects(CatalogQueryState)).toHaveLength(1); // Shared artist list only.

    realm.write(() => {
      applyV4FullSource(realm, fullSource);
      // Force missing metadata without changing the durable favorite.
      realm.objectForPrimaryKey(SourceTrack, trackAUuid)!.deletedAt = new Date();
    });
    await hydrator.hydrateMissing(capture);
    expect(
      realm.objectForPrimaryKey(Source, sourceAUuid)?.sourceSets.map((row) => row.uuid)
    ).toEqual([setAUuid]);
    expect(
      realm.objectForPrimaryKey(SourceSet, setAUuid)?.sourceTracks.map((row) => row.uuid)
    ).toEqual([trackAUuid, trackBUuid]);
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.deletedAt).toBeNull();
  });

  it("replaces only one artist's year membership and reactivates retained rows in place", () => {
    const otherArtist: V4ArtistResource = {
      ...artistResource('Other Artist'),
      id: encodeV4UuidCatalogId(otherArtistUuid, 'artist'),
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
      applyV4ArtistList(realm, [artistResource(), otherArtist]);
      const resultIds = applyV4ArtistYears(realm, artistUuid, [yearResource(), secondYear]);
      applyV4ArtistYears(realm, otherArtistUuid, [otherArtistYear]);
      return resultIds;
    });
    expect(returnedYearIds).toEqual([yearUuid, otherYearUuid]);
    const firstYear = realm.objectForPrimaryKey(Year, yearUuid)!;

    realm.write(() => applyV4ArtistYears(realm, artistUuid, [secondYear]));
    expect(realm.objectForPrimaryKey(Year, yearUuid)?.deletedAt).toBeInstanceOf(Date);
    expect(realm.objectForPrimaryKey(Year, otherArtistYearUuid)?.deletedAt).toBeNull();
    expect(hasV4ArtistYears(realm, artistUuid, [otherYearUuid])).toBe(true);
    expect(hasV4ArtistYears(realm, artistUuid, [otherYearUuid, otherYearUuid])).toBe(false);

    realm.write(() => applyV4ArtistYears(realm, artistUuid, [yearResource(), secondYear]));
    expect(firstYear.isValid()).toBe(true);
    expect(firstYear.deletedAt).toBeNull();
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
      applyV4ArtistList(realm, [artistResource()]);
      applyV4ArtistYears(realm, artistUuid, [yearResource(), secondYear]);
      applyV4Year(realm, artistUuid, yearUuid, yearWithShowsResource());
      applyV4Year(
        realm,
        artistUuid,
        otherYearUuid,
        yearWithShowsResource(secondYear, [secondShow])
      );
      applyV4FullShow(realm, detailedShow);
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
      applyV4Year(
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
    expect(hasV4Year(realm, artistUuid, yearUuid, [])).toBe(true);

    const returnedShowIds = realm.write(() =>
      applyV4Year(
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
    expect(hasV4Year(realm, artistUuid, yearUuid, [showUuid])).toBe(true);
  });

  it('refetches show detail after an overlapping year response rewrites its summary', async () => {
    realm.write(() => seedArtistAndYear(realm));
    const yearPath = `/artists/${artistId}/years/${encodeV4UuidCatalogId(yearUuid, 'year')}`;
    const showPath = `/shows/${showId}`;
    const correctedShow = fullShowResource([
      sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])]),
    ]);
    correctedShow.source_count = 1;
    correctedShow.avg_rating = 4.75;
    const olderYear = yearWithShowsResource(yearResource(), [
      showSummaryResource({ sourceCount: 1 }),
    ]);
    let releaseOlderYear: ((response: Response) => void) | undefined;
    let lastShowValidator: string | null | undefined;
    const transport = new CatalogV4Transport({
      apiBase: 'https://catalog.example/api',
      fetch: async (input, init) => {
        const path = new URL(String(input)).pathname.replace('/api/v4', '');
        if (path === yearPath) {
          return new Promise<Response>((resolve) => {
            releaseOlderYear = resolve;
          });
        }
        if (path === showPath) {
          lastShowValidator = new Headers(init?.headers).get('If-None-Match');
          if (lastShowValidator === 'W/"new-show"') {
            return new Response(null, {
              status: 304,
              headers: { etag: 'W/"new-show"' },
            });
          }
          return new Response(JSON.stringify(correctedShow), {
            status: 200,
            headers: { etag: 'W/"new-show"' },
          });
        }
        throw new Error(`Unexpected request ${path}`);
      },
    });
    const api = new RelistenApiClient({ transport });
    const year = new YearShowsNetworkBackedBehavior(
      realm,
      artistUuid,
      yearUuid,
      {},
      false
    ).sharedExecutor(api);
    const show = new ShowWithFullSourcesNetworkBackedBehavior(realm, showUuid).sharedExecutor(api);
    executors.push(year, show);

    const pendingYear = year.refresh(true);
    await vi.waitFor(() => expect(releaseOlderYear).toBeDefined());
    await show.refresh(true);
    expect(realm.objectForPrimaryKey(Show, showUuid)?.avgRating).toBe(4.75);

    releaseOlderYear!(
      new Response(JSON.stringify(olderYear), {
        status: 200,
        headers: { etag: 'W/"older-year"' },
      })
    );
    await pendingYear;
    await show.refresh(true);

    expect(lastShowValidator).toBeNull();
    expect(realm.objectForPrimaryKey(Show, showUuid)?.avgRating).toBe(4.75);
  });

  it('refetches venue detail after an older artist browse rewrites shared metadata', async () => {
    realm.write(() => {
      seedArtistAndYear(realm);
      realm.create(CatalogQueryState, {
        key: 'GET /artists?include_autocreated=true',
        etag: 'W/"artists"',
        hasAppliedData: true,
        lastAppliedAt: new Date(),
        lastCheckedAt: new Date(),
        retryPending: false,
        resultIds: [artistUuid],
      });
    });

    const venuePath = '/venues/venue_00000001';
    const artistVenuesPath = `/artists/${artistId}/venues`;
    let releaseOlderBrowse: ((response: Response) => void) | undefined;
    let lastVenueValidator: string | null | undefined;
    let venueRequests = 0;
    const transport = new CatalogV4Transport({
      apiBase: 'https://catalog.example/api',
      fetch: async (input, init) => {
        const path = new URL(String(input)).pathname.replace('/api/v4', '');
        if (path === artistVenuesPath) {
          return new Promise<Response>((resolve) => {
            releaseOlderBrowse = resolve;
          });
        }
        if (path === venuePath) {
          venueRequests += 1;
          lastVenueValidator = new Headers(init?.headers).get('If-None-Match');
          if (lastVenueValidator === 'W/"new-venue"') {
            return new Response(null, {
              status: 304,
              headers: { etag: 'W/"new-venue"' },
            });
          }
          return new Response(
            JSON.stringify({ ...normalizedVenueResource('Corrected Hall'), shows: [] }),
            { status: 200, headers: { etag: 'W/"new-venue"' } }
          );
        }
        throw new Error(`Unexpected request ${path}`);
      },
    });
    const api = new RelistenApiClient({ transport });
    const browse = new ArtistVenuesNetworkBackedBehavior(realm, artistUuid).sharedExecutor(api);
    const venue = new VenueShowsNetworkBackedBehavior(
      realm,
      'venue',
      undefined,
      'venue_00000001'
    ).sharedExecutor(api);
    executors.push(browse, venue);

    const pendingBrowse = browse.refresh(true);
    await vi.waitFor(() => expect(releaseOlderBrowse).toBeDefined());
    await venue.refresh(true);
    expect(realm.objectForPrimaryKey(NormalizedVenue, 'venue_00000001')?.name).toBe(
      'Corrected Hall'
    );
    const artistVenuePath = `/artists/${artistId}/venues/venue_00000001`;
    realm.write(() => {
      realm.create(CatalogQueryState, {
        key: `GET ${artistVenuePath}`,
        etag: 'W/"new-artist-venue"',
        hasAppliedData: true,
        lastAppliedAt: new Date(),
        lastCheckedAt: new Date(),
        retryPending: false,
        resultIds: ['artist_venue_00000002'],
      });
    });

    releaseOlderBrowse!(
      new Response(
        JSON.stringify([
          {
            kind: 'artist_venue',
            artist_venue: artistVenueResource('Older Hall'),
            imported_venue: null,
          },
        ]),
        { status: 200, headers: { etag: 'W/"older-browse"' } }
      )
    );
    await pendingBrowse;

    const invalidatedState = realm.objectForPrimaryKey(CatalogQueryState, `GET ${venuePath}`)!;
    expect(invalidatedState.hasAppliedData).toBe(true);
    expect(Array.from(invalidatedState.resultIds)).toEqual(['venue_00000001']);
    expect(invalidatedState.etag).toBeNull();
    expect(invalidatedState.lastCheckedAt).toBeNull();
    expect(realm.objectForPrimaryKey(NormalizedVenue, 'venue_00000001')?.name).toBe('Older Hall');
    const artistVenueState = realm.objectForPrimaryKey(
      CatalogQueryState,
      `GET ${artistVenuePath}`
    )!;
    expect(Array.from(artistVenueState.resultIds)).toEqual(['artist_venue_00000002']);
    expect(artistVenueState.etag).toBeNull();
    expect(artistVenueState.lastCheckedAt).toBeNull();

    await venue.refresh(false);

    expect(lastVenueValidator).toBeNull();
    expect(realm.objectForPrimaryKey(NormalizedVenue, 'venue_00000001')?.name).toBe(
      'Corrected Hall'
    );

    realm.write(() =>
      applyV4ArtistVenues(realm, artistUuid, [
        {
          kind: 'artist_venue',
          artist_venue: artistVenueResource('Corrected Hall'),
          imported_venue: null,
        },
      ])
    );
    await venue.refresh(false);
    expect(venueRequests).toBe(2);
  });

  it('rejects duplicate identities and membership from another parent', () => {
    realm.write(() => seedArtistAndYear(realm));

    expect(() =>
      realm.write(() => applyV4ArtistYears(realm, artistUuid, [yearResource(), yearResource()]))
    ).toThrow('contains duplicate identities');

    const foreignYear = yearResource({
      uuid: otherArtistYearUuid,
      ownerUuid: otherArtistUuid,
      year: '2024',
    });
    expect(() => realm.write(() => applyV4ArtistYears(realm, artistUuid, [foreignYear]))).toThrow(
      'inconsistent artist parent'
    );

    const secondYear = yearResource({ uuid: otherYearUuid, year: '2025' });
    expect(() =>
      realm.write(() =>
        applyV4Year(
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
      id: encodeV4UuidCatalogId('00000000-0000-4000-8000-00000000000e', 'track'),
      sourceId: sourceBId,
      setId: encodeV4UuidCatalogId('00000000-0000-4000-8000-00000000000f', 'source_set'),
    });
    const sourceBSet = sourceSetResource(sourceBTrack.source_set_id, sourceBId, [sourceBTrack]);

    realm.write(() => {
      seedArtistAndYear(realm);
      applyV4FullShow(
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
      applyV4FullShow(
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

  it('rejects tombstoned or incomplete detail graphs before reusing cached responses', () => {
    const source = sourceResource(sourceAId, [
      sourceSetResource(setAId, sourceAId, [trackResource()]),
    ]);
    const show = fullShowResource([source]);
    show.source_count = 1;

    realm.write(() => {
      seedArtistAndYear(realm);
      applyV4FullShow(realm, show);
    });
    expect(hasV4Show(realm, showUuid)).toBe(true);
    expect(hasV4Source(realm, sourceAUuid)).toBe(true);
    expect(hasV4Track(realm, trackAUuid)).toBe(true);

    realm.write(() => {
      realm.objectForPrimaryKey(SourceSet, setAUuid)!.sourceTracks.splice(0, 1);
    });
    expect(hasV4Show(realm, showUuid)).toBe(false);
    expect(hasV4Source(realm, sourceAUuid)).toBe(false);
    expect(hasV4Track(realm, trackAUuid)).toBe(false);

    realm.write(() => applyV4FullSource(realm, source));
    expect(hasV4Show(realm, showUuid)).toBe(true);
    expect(hasV4Source(realm, sourceAUuid)).toBe(true);
    expect(hasV4Track(realm, trackAUuid)).toBe(true);

    realm.write(() =>
      applyV4Year(
        realm,
        artistUuid,
        yearUuid,
        yearWithShowsResource(yearResource({ showCount: 0 }), [])
      )
    );
    expect(realm.objectForPrimaryKey(Show, showUuid)?.deletedAt).toBeInstanceOf(Date);
    expect(hasV4Show(realm, showUuid)).toBe(false);
    expect(hasV4Source(realm, sourceAUuid)).toBe(false);
    expect(hasV4Track(realm, trackAUuid)).toBe(false);
  });

  it('rejects a complete-looking show graph with no active playable tracks', () => {
    const show = fullShowResource([sourceResource(sourceAId, [])]);
    show.source_count = 1;

    realm.write(() => {
      seedArtistAndYear(realm);
      applyV4FullShow(realm, show);
    });

    expect(hasV4Source(realm, sourceAUuid)).toBe(true);
    expect(hasV4Show(realm, showUuid)).toBe(false);
  });

  it('moves an existing track between returned sets without tombstoning or duplicating it', () => {
    const trackB = trackResource({ id: trackBId, title: 'Second Track' });
    realm.write(() => {
      seedArtistAndYear(realm);
      applyV4FullShow(
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
      applyV4FullSource(
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
      applyV4ArtistList(realm, [artistResource()]);
      applyV4FullShow(realm, yearlessShow);
    });

    const track = realm.objectForPrimaryKey(SourceTrack, trackAUuid)!;
    expect(track.artist.uuid).toBe(artistUuid);
    expect(track.show.uuid).toBe(showUuid);
    expect(track.source.uuid).toBe(sourceAUuid);
    expect(track.year).toBeNull();
  });

  it('tombstones omitted artists and reactivates an unchanged returned row in place', () => {
    const otherArtist: V4ArtistResource = {
      ...artistResource('Other Artist'),
      id: encodeV4UuidCatalogId(otherArtistUuid, 'artist'),
      slug: 'other-artist',
      sort_name: 'Other Artist',
    };

    realm.write(() => applyV4ArtistList(realm, [artistResource(), otherArtist]));
    const firstArtist = realm.objectForPrimaryKey(Artist, otherArtistUuid)!;
    realm.write(() => applyV4ArtistList(realm, [artistResource()]));
    expect(realm.objectForPrimaryKey(Artist, otherArtistUuid)?.deletedAt).toBeInstanceOf(Date);

    realm.write(() => applyV4ArtistList(realm, [otherArtist]));
    expect(firstArtist.isValid()).toBe(true);
    expect(firstArtist.updatedAt.toISOString()).toBe(timestamp);
    expect(firstArtist.deletedAt).toBeNull();
    expect(realm.objectForPrimaryKey(Artist, artistUuid)?.deletedAt).toBeInstanceOf(Date);
  });

  it('rolls back graph changes when a required parent is inconsistent', () => {
    realm.write(() => {
      seedArtistAndYear(realm);
      applyV4FullShow(
        realm,
        fullShowResource([
          sourceResource(sourceAId, [sourceSetResource(setAId, sourceAId, [trackResource()])]),
        ])
      );
    });

    const invalidSource = sourceResource(sourceBId, []);
    invalidSource.show_id = encodeV4UuidCatalogId(otherShowUuid, 'show');
    const changedShow = fullShowResource([
      sourceResource(sourceAId, [
        sourceSetResource(setAId, sourceAId, [trackResource({ title: 'Must Roll Back' })]),
      ]),
      invalidSource,
    ]);
    changedShow.display_date = 'Changed but rolled back';

    expect(() => {
      realm.write(() => applyV4FullShow(realm, changedShow));
    }).toThrow(V4CatalogApplyError);

    expect(realm.objectForPrimaryKey(Show, showUuid)?.displayDate).toBe('2026-10-31');
    expect(realm.objectForPrimaryKey(SourceTrack, trackAUuid)?.title).toBe('Imported Track Title');
    expect(realm.objectForPrimaryKey(Source, sourceBUuid)).toBeNull();
  });
});
