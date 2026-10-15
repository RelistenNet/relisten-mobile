import Realm from 'realm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: { extend: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock('expo-file-system', () => ({
  Paths: { document: '/tmp', join: (...parts: string[]) => parts.join('/') },
}));
vi.mock('@/relisten/events', () => ({ sharedStatsigClient: vi.fn() }));
vi.mock('@/relisten/api/client', () => ({
  RelistenApiResponseType: { Offline: 0, OnlineRequestCompleted: 3 },
}));
vi.mock('@/relisten/api/context', () => ({}));
vi.mock('@/relisten/realm/models/artist_repo', () => ({}));
vi.mock('@/relisten/realm/schema', () => ({}));
vi.mock('@/relisten/realm/root_services', () => ({}));
vi.mock('@/relisten/util/routes', () => ({}));
vi.mock('@/relisten/realm/network_backed_behavior_hooks', () => ({}));

import { FlacType, ShowWithSources as ApiShowWithSources } from '@/relisten/api/models/source';
import { ShowWithFullSourcesNetworkBackedBehavior } from './show_repo';
import { Artist } from './artist';
import { Year } from './year';
import { Show } from './show';
import { Source } from './source';
import { SourceSet } from './source_set';
import { SourceTrack } from './source_track';
import { SourceTrackOfflineInfo } from './source_track_offline_info';
import { Venue } from './venue';
import { Tour } from './tour';
import { Song } from './song';
import { Popularity, PopularityWindow, PopularityWindows } from './popularity';

const timestamp = '2026-08-20T00:00:00.000Z';
const timestamps = { created_at: timestamp, updated_at: timestamp };
const config: Realm.Configuration = {
  path: '/tmp/relisten-show-repo-test.realm',
  schema: [
    Artist,
    Year,
    Show,
    Source,
    SourceSet,
    SourceTrack,
    SourceTrackOfflineInfo,
    Venue,
    Tour,
    Song,
    Popularity,
    PopularityWindow,
    PopularityWindows,
  ],
};

function showPayload(): ApiShowWithSources {
  return {
    ...timestamps,
    uuid: 'show',
    id: 1,
    artist_id: 1,
    artist_uuid: 'artist',
    year_uuid: 'year',
    year: {
      ...timestamps,
      uuid: 'year',
      id: 1,
      artist_id: 1,
      artist_uuid: 'artist',
      year: '2026',
      show_count: 1,
      source_count: 1,
      avg_rating: 0,
    },
    date: timestamp,
    display_date: '2026-08-20',
    avg_rating: 0,
    most_recent_source_updated_at: timestamp,
    has_soundboard_source: false,
    has_streamable_flac_source: false,
    source_count: 1,
    sources: [
      {
        ...timestamps,
        uuid: 'source',
        id: '1',
        artist_uuid: 'artist',
        show_uuid: 'show',
        venue_uuid: '',
        display_date: '2026-08-20',
        is_soundboard: false,
        is_remaster: false,
        has_jamcharts: false,
        avg_rating: 0,
        num_reviews: 0,
        avg_rating_weighted: 0,
        upstream_identifier: 'source',
        description: '',
        taper_notes: '',
        source: '',
        taper: '',
        transferrer: '',
        lineage: '',
        flac_type: FlacType.NoFlac,
        review_count: 0,
        links: [],
        sets: [
          {
            ...timestamps,
            uuid: 'set',
            source_uuid: 'source',
            artist_uuid: 'artist',
            index: 0,
            is_encore: false,
            name: 'Set 1',
            __injected_show_uuid: 'show',
            tracks: ['track-2', 'track-1'].map((uuid, index) => ({
              ...timestamps,
              uuid,
              source_uuid: 'source',
              source_set_uuid: 'set',
              artist_uuid: 'artist',
              show_uuid: 'show',
              track_position: index + 1,
              title: uuid,
              slug: uuid,
              mp3_url: `https://example.com/${uuid}.mp3`,
              __injected_show_uuid: 'show',
            })),
          },
        ],
      },
    ],
  };
}

function deleteRealm() {
  if (Realm.exists(config)) Realm.deleteFile(config);
}

describe('ShowWithFullSourcesNetworkBackedBehavior year hydration', () => {
  let realm: Realm;
  let behavior: ShowWithFullSourcesNetworkBackedBehavior;

  beforeEach(() => {
    deleteRealm();
    realm = new Realm(config);
    realm.write(() =>
      realm.create(Artist, {
        uuid: 'artist',
        createdAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
        musicbrainzId: '',
        name: 'Artist',
        featured: 0,
        slug: 'artist',
        sortName: 'artist',
        featuresRaw: '{}',
        upstreamSourcesRaw: '[]',
        showCount: 1,
        sourceCount: 1,
      })
    );
    behavior = new ShowWithFullSourcesNetworkBackedBehavior(realm, 'show');
  });

  afterEach(() => {
    realm.close();
    deleteRealm();
  });

  afterAll(() => Realm.shutdown());

  function ingest(payload: ApiShowWithSources) {
    behavior.upsert(
      {
        show: realm.objectForPrimaryKey(Show, 'show') ?? undefined,
        sources: realm.objects(Source).filtered('showUuid == $0', 'show'),
      },
      payload
    );
  }

  function expectPlayableGraph() {
    const set = realm.objectForPrimaryKey(SourceSet, 'set')!;
    expect(Array.from(set.sourceTracks, (track) => track.uuid)).toEqual(['track-2', 'track-1']);
    for (const track of set.sourceTracks) {
      expect(track.artist.uuid).toBe('artist');
      expect(track.year.uuid).toBe('year');
      expect(track.show.uuid).toBe('show');
      expect(track.source.uuid).toBe('source');
      expect(track.deletedAt).toBeNull();
    }
  }

  it('creates the embedded year before attaching tracks on a cold-cache show load', () => {
    ingest(showPayload());

    expect(realm.objectForPrimaryKey(Year, 'year')?.year).toBe('2026');
    expectPlayableGraph();
  });

  it('restores quarantined tracks and their order when the same payload later supplies the year', () => {
    const payload = showPayload();
    ingest({ ...payload, year: undefined });
    const originalTrack = realm.objectForPrimaryKey(SourceTrack, 'track-1')!;
    expect(originalTrack.deletedAt).toBeInstanceOf(Date);
    expect(realm.objectForPrimaryKey(SourceSet, 'set')!.sourceTracks).toHaveLength(0);

    ingest(payload);

    expect(originalTrack.isValid()).toBe(true);
    expect(originalTrack.deletedAt).toBeNull();
    expect(realm.objects(SourceTrack)).toHaveLength(2);
    expectPlayableGraph();
  });

  it('uses an existing year when the show response omits the nested year', () => {
    realm.write(() => realm.create(Year, Year.propertiesFromApi(showPayload().year!)));

    ingest({ ...showPayload(), year: undefined });

    expectPlayableGraph();
  });

  it('restores the existing year from a positive response with unchanged timestamps', () => {
    const year = realm.write(() =>
      realm.create(Year, {
        ...Year.propertiesFromApi(showPayload().year!),
        deletedAt: new Date(timestamp),
      })
    );

    ingest(showPayload());

    expect(year.isValid()).toBe(true);
    expect(year.deletedAt).toBeNull();
    expect(realm.objects(Year)).toHaveLength(1);
    expectPlayableGraph();
  });

  it('keeps tracks quarantined when neither the cache nor the payload has a year', () => {
    ingest({ ...showPayload(), year: undefined });

    expect(realm.objects(Year)).toHaveLength(0);
    expect(realm.objectForPrimaryKey(SourceSet, 'set')!.sourceTracks).toHaveLength(0);
    expect(realm.objects(SourceTrack)).toHaveLength(2);
    for (const track of realm.objects(SourceTrack)) {
      expect(track.deletedAt).toBeInstanceOf(Date);
    }
  });
});
