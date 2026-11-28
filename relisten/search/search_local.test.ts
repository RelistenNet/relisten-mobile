import Realm from 'realm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) },
}));
vi.mock('expo-file-system', () => ({
  Paths: { document: '/tmp', join: (...parts: string[]) => parts.join('/') },
}));
vi.mock('@/relisten/events', () => ({ sharedStatsigClient: () => ({ logEvent: vi.fn() }) }));
vi.mock('@/relisten/playlists/playlist_hooks', () => ({ visiblePlaylists: vi.fn() }));

import { Artist } from '@/relisten/realm/models/artist';
import { Year } from '@/relisten/realm/models/year';
import { Show } from '@/relisten/realm/models/show';
import { Venue } from '@/relisten/realm/models/venue';
import { Tour } from '@/relisten/realm/models/tour';
import { Song } from '@/relisten/realm/models/song';
import { FlacType, Source } from '@/relisten/realm/models/source';
import { SourceSet } from '@/relisten/realm/models/source_set';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import {
  Popularity,
  PopularityWindow,
  PopularityWindows,
} from '@/relisten/realm/models/popularity';
import { CATALOG_REALM_MODELS } from '@/relisten/realm/models/catalog';
import { searchLocal } from './search_local';

const TEST_REALM_PATH = '/tmp/relisten-search-local-test.realm';
const now = new Date('2026-11-22T00:00:00.000Z');

const config: Realm.Configuration = {
  path: TEST_REALM_PATH,
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
    Popularity,
    PopularityWindow,
    PopularityWindows,
    ...CATALOG_REALM_MODELS,
  ],
};

let realm: Realm;

function seedShow() {
  const artist = realm.create(Artist, {
    uuid: 'billy',
    createdAt: now,
    updatedAt: now,
    musicbrainzId: '',
    name: 'Billy Strings',
    featured: 0,
    slug: 'billy-strings',
    sortName: 'Billy Strings',
    featuresRaw: '{}',
    upstreamSourcesRaw: '[]',
    showCount: 1,
    sourceCount: 1,
  });
  const venue = realm.create(Venue, {
    uuid: 'red-rocks',
    createdAt: now,
    updatedAt: now,
    artistUuid: 'billy',
    name: 'Red Rocks Amphitheatre',
    location: 'Morrison, CO',
    slug: 'red-rocks',
    upstreamIdentifier: 'red-rocks',
    sortName: 'Red Rocks Amphitheatre',
    showsAtVenue: 1,
  });
  const show = realm.create(Show, {
    uuid: 'show-2022',
    createdAt: now,
    updatedAt: now,
    artistUuid: 'billy',
    date: new Date('2022-05-13T00:00:00.000Z'),
    avgRating: 0,
    displayDate: '2022-05-13',
    mostRecentSourceUpdatedAt: now,
    hasSoundboardSource: false,
    hasStreamableFlacSource: false,
    sourceCount: 1,
    artist,
    venue,
  });
  const source = realm.create(Source, {
    uuid: 'source-ck63',
    createdAt: now,
    updatedAt: now,
    artistUuid: 'billy',
    showUuid: 'show-2022',
    displayDate: '2022-05-13',
    isSoundboard: false,
    isRemaster: false,
    hasJamcharts: false,
    avgRating: 0,
    numReviews: 0,
    avgRatingWeighted: 0,
    upstreamIdentifier: 'bs2022-05-13.ck63',
    flacType: FlacType.NoFlac,
    reviewCount: 0,
    linksRaw: '[]',
    artist,
  });
  return { artist, show, source };
}

function addTrack(
  seeded: ReturnType<typeof seedShow>,
  uuid: string,
  title: string,
  status: SourceTrackOfflineInfoStatus | null
) {
  const offlineInfo =
    status === null
      ? undefined
      : realm.create(SourceTrackOfflineInfo, {
          sourceTrackUuid: uuid,
          status,
          type: 1,
          queuedAt: now,
        });

  return realm.create(SourceTrack, {
    uuid,
    createdAt: now,
    updatedAt: now,
    artistUuid: 'billy',
    sourceUuid: seeded.source.uuid,
    sourceSetUuid: 'set-1',
    showUuid: seeded.show.uuid,
    trackPosition: 1,
    title,
    slug: uuid,
    mp3Url: `https://example.com/${uuid}.mp3`,
    artist: seeded.artist,
    show: seeded.show,
    source: seeded.source,
    offlineInfo,
  });
}

describe('searchLocal', () => {
  beforeEach(() => {
    Realm.deleteFile(config);
    realm = new Realm(config);
  });

  afterEach(() => {
    realm.close();
  });

  afterAll(() => {
    Realm.deleteFile(config);
  });

  it('matches a downloaded track, with its show and source, and skips one that is not downloaded', () => {
    realm.write(() => {
      const seeded = seedShow();
      addTrack(
        seeded,
        'creek-downloaded',
        'Away From the Mire > Creek',
        SourceTrackOfflineInfoStatus.Succeeded
      );
      addTrack(seeded, 'creek-streaming', 'Creek', null);
      addTrack(seeded, 'creek-queued', 'Creek (reprise)', SourceTrackOfflineInfoStatus.Queued);
    });

    const results = searchLocal(realm, ' creek ', { includePlaylists: false, libraryUserId: null });

    expect(results.tracks.map((track) => track.uuid)).toEqual(['creek-downloaded']);
    expect(results.tracks[0].show?.displayDate).toBe('2022-05-13');
    expect(results.tracks[0].source?.upstreamIdentifier).toBe('bs2022-05-13.ck63');
  });

  it('finds downloaded artists and shows by artist, date or venue', () => {
    realm.write(() => {
      addTrack(seedShow(), 'creek', 'Creek', SourceTrackOfflineInfoStatus.Succeeded);
    });

    expect(
      searchLocal(realm, 'billy', { includePlaylists: false, libraryUserId: null }).artists.map(
        (artist) => artist.name
      )
    ).toEqual(['Billy Strings']);
    expect(
      searchLocal(realm, 'red rocks', { includePlaylists: false, libraryUserId: null }).shows.map(
        (show) => show.uuid
      )
    ).toEqual(['show-2022']);
  });

  it('leaves out an artist and show with nothing downloaded', () => {
    realm.write(() => {
      addTrack(seedShow(), 'creek', 'Creek', SourceTrackOfflineInfoStatus.Queued);
    });

    const byArtist = searchLocal(realm, 'billy', { includePlaylists: false, libraryUserId: null });
    const byVenue = searchLocal(realm, 'red rocks', {
      includePlaylists: false,
      libraryUserId: null,
    });
    expect(byArtist.artists).toEqual([]);
    expect(byVenue.shows).toEqual([]);
  });

  it('lists a show’s downloaded tracks once narrowed to it, without a query', () => {
    realm.write(() => {
      const seeded = seedShow();
      addTrack(seeded, 'creek', 'Creek', SourceTrackOfflineInfoStatus.Succeeded);
      addTrack(seeded, 'other', 'Other', null);
    });

    const results = searchLocal(realm, '', {
      narrowing: { showUuid: 'show-2022' },
      includePlaylists: false,
      libraryUserId: null,
    });

    expect(results.tracks.map((track) => track.uuid)).toEqual(['creek']);
    expect(results.shows).toEqual([]);
  });
});
