import Realm from 'realm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/relisten/util/logging', () => ({
  log: {
    extend: () => ({
      info: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

vi.mock('expo-file-system', () => ({
  Paths: {
    document: '/tmp',
    join: (...parts: string[]) => parts.join('/'),
  },
}));

vi.mock('@/relisten/events', () => ({
  sharedStatsigClient: vi.fn(),
}));

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(),
}));

import { PlaybackHistoryReporter } from '@/relisten/playback_history_reporter';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';

const TEST_REALM_PATH = '/tmp/relisten-playback-history-reporter-test.realm';
const now = new Date('2026-08-20T00:00:00.000Z');

class TestSourceTrack extends Realm.Object<TestSourceTrack> {
  static schema: Realm.ObjectSchema = {
    name: 'SourceTrack',
    primaryKey: 'uuid',
    properties: { uuid: 'string' },
  };

  uuid!: string;
}

class TestArtist extends Realm.Object<TestArtist> {
  static schema: Realm.ObjectSchema = {
    name: 'Artist',
    primaryKey: 'uuid',
    properties: { uuid: 'string' },
  };

  uuid!: string;
}

class TestShow extends Realm.Object<TestShow> {
  static schema: Realm.ObjectSchema = {
    name: 'Show',
    primaryKey: 'uuid',
    properties: { uuid: 'string' },
  };

  uuid!: string;
}

class TestSource extends Realm.Object<TestSource> {
  static schema: Realm.ObjectSchema = {
    name: 'Source',
    primaryKey: 'uuid',
    properties: { uuid: 'string' },
  };

  uuid!: string;
}

const config: Realm.Configuration = {
  path: TEST_REALM_PATH,
  schema: [TestSourceTrack, TestArtist, TestShow, TestSource, PlaybackHistoryEntry],
};

describe('PlaybackHistoryReporter', () => {
  let realm: Realm;

  beforeEach(() => {
    if (Realm.exists(config)) Realm.deleteFile(config);
    realm = new Realm(config);
  });

  afterEach(() => {
    realm.close();
    if (Realm.exists(config)) Realm.deleteFile(config);
  });

  afterAll(() => {
    Realm.shutdown();
  });

  it('does not retain a history object while publishing it', async () => {
    let resolveRequest!: (response: { error?: unknown }) => void;
    const recordPlayback = vi.fn(
      () =>
        new Promise<{ error?: unknown }>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const reporter = new PlaybackHistoryReporter({ recordPlayback } as never, realm);
    let entry!: PlaybackHistoryEntry;

    realm.write(() => {
      const sourceTrack = realm.create(TestSourceTrack, { uuid: 'track' });
      const artist = realm.create(TestArtist, { uuid: 'artist' });
      const show = realm.create(TestShow, { uuid: 'show' });
      const source = realm.create(TestSource, { uuid: 'source' });
      entry = realm.create('PlaybackHistoryEntry', {
        uuid: 'history',
        playbackFlags: 0,
        createdAt: now,
        playbackStartedAt: now,
        sourceTrack,
        artist,
        show,
        source,
      }) as unknown as PlaybackHistoryEntry;
    });

    const reportPromise = (
      reporter as unknown as {
        attemptReport(entryUuid: string): Promise<unknown>;
      }
    ).attemptReport(entry.uuid);

    expect(recordPlayback).toHaveBeenCalledWith('track');
    realm.write(() => realm.delete(entry));
    resolveRequest({});

    await expect(reportPromise).resolves.toBeDefined();
    expect(realm.objects(PlaybackHistoryEntry)).toHaveLength(0);
  });
});
