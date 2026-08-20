/// <reference types="node" />

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as Sentry from '@sentry/react-native';
import Realm from 'realm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activeCatalogObjectForPrimaryKey,
  activeCatalogObjects,
} from '@/relisten/realm/catalog_retirement';
import { resetCatalogAccessMonitorForTests } from '@/relisten/realm/catalog_access_monitor';
import {
  auditCatalogRetirementGraph,
  retireCatalogGraph,
} from '@/relisten/realm/catalog_retirement_graph';
import { Artist } from '@/relisten/realm/models/artist';
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
import { SourceTrackOfflineInfo } from '@/relisten/realm/models/source_track_offline_info';
import { Tour } from '@/relisten/realm/models/tour';
import { Venue } from '@/relisten/realm/models/venue';
import { Year } from '@/relisten/realm/models/year';
import { Repository } from '@/relisten/realm/repository';
import { ActiveCatalogObjectValueStream } from '@/relisten/realm/value_streams';

interface VenueProperties {
  uuid: string;
  createdAt: Date;
  updatedAt: Date;
  name: string;
}

interface VenueApi {
  uuid: string;
  created_at: string;
  updated_at: string;
  name: string;
}

class TestVenue extends Realm.Object<TestVenue, keyof VenueProperties> implements VenueProperties {
  static schema: Realm.ObjectSchema = {
    name: 'Venue',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      createdAt: 'date',
      updatedAt: 'date',
      name: 'string',
      retiredAt: { type: 'date', optional: true, indexed: true },
      retirementReason: 'string?',
    },
  };

  declare uuid: string;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare name: string;
  declare retiredAt?: Date;
  declare retirementReason?: string;

  static propertiesFromApi(api: VenueApi): VenueProperties {
    return {
      uuid: api.uuid,
      createdAt: new Date(api.created_at),
      updatedAt: new Date(api.updated_at),
      name: api.name,
    };
  }
}

class TestTour extends Realm.Object<TestTour> {
  static schema: Realm.ObjectSchema = {
    name: 'Tour',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      retiredAt: { type: 'date', optional: true, indexed: true },
      retirementReason: 'string?',
    },
  };

  declare uuid: string;
  declare retiredAt?: Date;
  declare retirementReason?: string;
}

class TestShow extends Realm.Object<TestShow> {
  static schema: Realm.ObjectSchema = {
    name: 'Show',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      retiredAt: { type: 'date', optional: true, indexed: true },
      retirementReason: 'string?',
      venueUuid: 'string?',
      tourUuid: 'string?',
      venue: 'Venue?',
      tour: 'Tour?',
    },
  };

  declare uuid: string;
  declare retiredAt?: Date;
  declare retirementReason?: string;
  declare venueUuid?: string;
  declare tourUuid?: string;
  declare venue?: TestVenue;
  declare tour?: TestTour;
}

const openRealms: Realm[] = [];
const tempDirectories: string[] = [];

function temporaryRealm(schemaVersion = 13) {
  const directory = mkdtempSync(join(tmpdir(), 'relisten-catalog-retirement-'));
  tempDirectories.push(directory);
  const realm = new Realm({
    path: join(directory, 'test.realm'),
    schema: [TestVenue, TestTour, TestShow],
    schemaVersion,
  });
  openRealms.push(realm);
  return realm;
}

function temporaryCatalogRealm() {
  const directory = mkdtempSync(join(tmpdir(), 'relisten-catalog-graph-'));
  tempDirectories.push(directory);
  const realm = new Realm({
    path: join(directory, 'test.realm'),
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
    ],
    schemaVersion: 1,
  });
  openRealms.push(realm);
  return realm;
}

function createVenue(realm: Realm, uuid: string, updatedAt: Date) {
  return realm.write(
    () =>
      new TestVenue(realm, {
        uuid,
        createdAt: updatedAt,
        updatedAt,
        name: uuid,
      })
  );
}

afterEach(() => {
  for (const realm of openRealms.splice(0)) {
    if (!realm.isClosed) realm.close();
  }
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
  resetCatalogAccessMonitorForTests();
  vi.clearAllMocks();
});

describe('catalog retirement', () => {
  it('retires a missing authoritative row without invalidating its managed object', () => {
    const realm = temporaryRealm();
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const retiredAt = new Date('2026-02-01T00:00:00.000Z');
    const retained = createVenue(realm, 'retained', updatedAt);
    const missing = createVenue(realm, 'missing', updatedAt);
    const repository = new Repository(TestVenue);

    const result = repository.upsertMultiple(
      realm,
      [
        {
          uuid: retained.uuid,
          created_at: updatedAt.toISOString(),
          updated_at: updatedAt.toISOString(),
          name: retained.name,
        },
      ],
      activeCatalogObjects(realm, TestVenue),
      { retiredAt }
    );

    expect(result.retired).toBe(1);
    expect(result.retiredModels).toEqual([missing]);
    expect(missing.isValid()).toBe(true);
    expect(missing.retiredAt).toEqual(retiredAt);
    expect(missing.retirementReason).toBe('api-reconciliation');
    expect(activeCatalogObjects(realm, TestVenue).map((venue) => venue.uuid)).toEqual(['retained']);
  });

  it('resurrects the same row even when the API timestamp has not changed', () => {
    const realm = temporaryRealm();
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const venue = createVenue(realm, 'venue', updatedAt);
    const repository = new Repository(TestVenue);

    realm.write(() => {
      venue.retiredAt = new Date('2026-02-01T00:00:00.000Z');
      venue.retirementReason = 'test';
    });

    const result = repository.upsertMultiple(
      realm,
      [
        {
          uuid: venue.uuid,
          created_at: updatedAt.toISOString(),
          updated_at: updatedAt.toISOString(),
          name: venue.name,
        },
      ],
      activeCatalogObjects(realm, TestVenue)
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.restored).toBe(1);
    expect(result.restoredModels).toEqual([venue]);
    expect(venue.isValid()).toBe(true);
    expect(venue.retiredAt).toBeNull();
    expect(venue.retirementReason).toBeNull();
    expect(realm.objects(TestVenue).length).toBe(1);
  });

  it('preserves a Venue omitted by an authoritative response while an active Show names it', () => {
    const realm = temporaryRealm();
    const venue = createVenue(realm, 'venue', new Date('2026-01-01T00:00:00.000Z'));
    const repository = new Repository(TestVenue);
    realm.write(() => {
      new TestShow(realm, { uuid: 'show', venueUuid: venue.uuid });
    });

    const result = repository.upsertMultiple(realm, [], [venue]);

    expect(result.retired).toBe(0);
    expect(result.retiredModels).toEqual([]);
    expect(venue.retiredAt).toBeNull();
  });

  it('preserves a Tour reached by an active Show direct link', () => {
    const realm = temporaryRealm();
    let tour!: TestTour;
    realm.write(() => {
      tour = new TestTour(realm, { uuid: 'tour' });
      new TestShow(realm, { uuid: 'show', tour });
    });

    const result = retireCatalogGraph(realm, tour, {
      reason: 'test',
      report: false,
    });

    expect(result.total).toBe(0);
    expect(tour.retiredAt).toBeNull();
  });

  it('returns an already-retired omitted child as a tombstone for membership preservation', () => {
    const realm = temporaryRealm();
    const venue = createVenue(realm, 'venue', new Date('2026-01-01T00:00:00.000Z'));
    const repository = new Repository(TestVenue);
    realm.write(() => {
      venue.retiredAt = new Date('2026-02-01T00:00:00.000Z');
      venue.retirementReason = 'earlier-reconciliation';
    });

    const result = repository.upsertMultiple(realm, [], [venue]);

    expect(result.retired).toBe(0);
    expect(result.retiredModels).toEqual([venue]);
  });

  it('retires Shows before their Venue and Tour during an Artist cascade', () => {
    const realm = temporaryCatalogRealm();
    const timestamp = new Date('2026-01-01T00:00:00.000Z');
    const retiredAt = new Date('2026-02-01T00:00:00.000Z');
    let artist!: Artist;
    let venue!: Venue;
    let tour!: Tour;
    let show!: Show;

    realm.write(() => {
      artist = realm.create(Artist, {
        uuid: 'artist',
        createdAt: timestamp,
        updatedAt: timestamp,
        musicbrainzId: '',
        name: 'Artist',
        featured: 0,
        slug: 'artist',
        sortName: 'Artist',
        featuresRaw: '{}',
        upstreamSourcesRaw: '[]',
        showCount: 1,
        sourceCount: 0,
        isFavorite: false,
      });
      venue = realm.create(Venue, {
        uuid: 'venue',
        createdAt: timestamp,
        updatedAt: timestamp,
        artistUuid: artist.uuid,
        name: 'Venue',
        location: 'Somewhere',
        upstreamIdentifier: 'venue',
        slug: 'venue',
        sortName: 'Venue',
        showsAtVenue: 1,
        isFavorite: false,
      });
      tour = realm.create(Tour, {
        uuid: 'tour',
        createdAt: timestamp,
        updatedAt: timestamp,
        artistUuid: artist.uuid,
        startDate: timestamp,
        endDate: timestamp,
        name: 'Tour',
        slug: 'tour',
        upstreamIdentifier: 'tour',
        isFavorite: false,
      });
      show = realm.create(Show, {
        uuid: 'show',
        artistUuid: artist.uuid,
        yearUuid: 'year',
        venueUuid: venue.uuid,
        tourUuid: tour.uuid,
        createdAt: timestamp,
        updatedAt: timestamp,
        date: timestamp,
        avgRating: 0,
        displayDate: '2026-01-01',
        mostRecentSourceUpdatedAt: timestamp,
        hasSoundboardSource: false,
        hasStreamableFlacSource: false,
        sourceCount: 0,
        artist,
        venue,
        tour,
        isFavorite: false,
      });
    });

    const result = retireCatalogGraph(realm, artist, {
      reason: 'artist-api-reconciliation',
      retiredAt,
      report: false,
    });

    expect(result.counts.Artist).toBe(1);
    expect(result.counts.Show).toBe(1);
    expect(result.counts.Venue).toBe(1);
    expect(result.counts.Tour).toBe(1);
    expect(show.retiredAt).toEqual(retiredAt);
    expect(venue.retiredAt).toEqual(retiredAt);
    expect(tour.retiredAt).toEqual(retiredAt);

    realm.write(() => {
      realm.create(Song, {
        uuid: 'song',
        createdAt: timestamp,
        updatedAt: timestamp,
        artistUuid: artist.uuid,
        name: 'Song',
        slug: 'song',
        upstreamIdentifier: 'song',
        sortName: 'Song',
        showsPlayedAt: 1,
        isFavorite: false,
        shows: [show],
      });
    });

    const audit = auditCatalogRetirementGraph(realm);
    expect(audit.membershipLinks['Song.shows']).toBe(1);
    expect(audit.totalRetainedMemberships).toBe(1);
    expect(audit.totalViolations).toBe(0);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        message: 'Retained catalog memberships observed',
      })
    );
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warning' })
    );
  });

  it('groups unexpected active lookups once per model and access site', () => {
    const realm = temporaryRealm();
    const venue = createVenue(realm, 'venue', new Date('2026-01-01T00:00:00.000Z'));
    realm.write(() => {
      venue.retiredAt = new Date('2026-02-01T00:00:00.000Z');
    });

    expect(venue.uuid).toBe('venue');
    expect(
      activeCatalogObjectForPrimaryKey(realm, TestVenue, venue.uuid, 'test.active-lookup')
    ).toBeUndefined();
    expect(
      activeCatalogObjectForPrimaryKey(realm, TestVenue, venue.uuid, 'test.active-lookup')
    ).toBeUndefined();

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it('hides and reports a tombstone reached through a live active stream', () => {
    const realm = temporaryRealm();
    const venue = createVenue(realm, 'venue', new Date('2026-01-01T00:00:00.000Z'));
    realm.write(() => {
      venue.retiredAt = new Date('2026-02-01T00:00:00.000Z');
    });

    const stream = new ActiveCatalogObjectValueStream(
      realm,
      TestVenue,
      venue.uuid,
      'test.active-stream'
    );

    expect(stream.currentValue).toBeNull();
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    stream.tearDown();
  });

  it('migrates an existing schema by adding nullable retirement fields', () => {
    const directory = mkdtempSync(join(tmpdir(), 'relisten-catalog-migration-'));
    tempDirectories.push(directory);
    const path = join(directory, 'migration.realm');
    const oldSchema: Realm.ObjectSchema = {
      name: 'Venue',
      primaryKey: 'uuid',
      properties: {
        uuid: 'string',
        createdAt: 'date',
        updatedAt: 'date',
        name: 'string',
      },
    };
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const oldRealm = new Realm({ path, schema: [oldSchema], schemaVersion: 12 });
    oldRealm.write(() => {
      oldRealm.create('Venue', {
        uuid: 'existing',
        createdAt: updatedAt,
        updatedAt,
        name: 'Existing Venue',
      });
    });
    oldRealm.close();

    const migratedRealm = new Realm({ path, schema: [TestVenue], schemaVersion: 13 });
    openRealms.push(migratedRealm);
    const venue = migratedRealm.objectForPrimaryKey(TestVenue, 'existing');

    expect(venue?.name).toBe('Existing Venue');
    expect(venue?.retiredAt).toBeNull();
    expect(venue?.retirementReason).toBeNull();
  });
});
