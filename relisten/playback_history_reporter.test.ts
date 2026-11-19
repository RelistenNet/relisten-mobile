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
  randomUUID: () => globalThis.crypto.randomUUID(),
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

import { PlaybackHistoryReporter } from '@/relisten/playback_history_reporter';
import { discardUnreportedPlays, forgetAccountPlays } from '@/relisten/history/play_history_rows';
import {
  PlaybackFlags,
  PlaybackHistoryEntry,
} from '@/relisten/realm/models/history/playback_history_entry';
import type { SourceTrack } from '@/relisten/realm/models/source_track';

const TEST_REALM_PATH = '/tmp/relisten-playback-history-reporter-test.realm';
const trackUuid = '98615c1f-a84b-de71-5ae0-0e6fff2461f9';
const accountA = 'user_01890a5dac96774bbcceb302099a8051';
const accountB = 'user_01890a5dac96774bbcceb302099a8061';

class TestSourceTrack extends Realm.Object<TestSourceTrack> {
  static schema: Realm.ObjectSchema = {
    name: 'SourceTrack',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      artistUuid: 'string',
      showUuid: 'string',
      sourceUuid: 'string',
      duration: 'double?',
    },
  };
}

const entity = (name: string): Realm.ObjectSchema => ({
  name,
  primaryKey: 'uuid',
  properties: { uuid: 'string' },
});

const config: Realm.Configuration = {
  path: TEST_REALM_PATH,
  schema: [
    TestSourceTrack,
    entity('Artist'),
    entity('Show'),
    entity('Source'),
    PlaybackHistoryEntry,
  ],
};

/** A signed-in account that can change between a request and its response. */
function fakeAccounts(initial: string | null) {
  let userId = initial;
  let generation = 0;
  const request = vi.fn();
  return {
    request,
    signInAs(next: string | null) {
      userId = next;
      generation += 1;
    },
    accounts: {
      scopes: {
        capture: () => ({ isAuthenticated: userId !== null, userId, generation }),
        isCurrent: (capture: { generation: number }) => capture.generation === generation,
      },
      api: { request },
    } as never,
  };
}

describe('PlaybackHistoryReporter', () => {
  let realm: Realm;
  let sourceTrack: SourceTrack;
  let recordAnonymously: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    if (Realm.exists(config)) Realm.deleteFile(config);
    realm = new Realm(config);
    sourceTrack = realm.write(() => {
      for (const name of ['Artist', 'Show', 'Source']) {
        realm.create(name, { uuid: name });
      }
      return realm.create(TestSourceTrack, {
        uuid: trackUuid,
        artistUuid: 'Artist',
        showUuid: 'Show',
        sourceUuid: 'Source',
        duration: 381.4,
      });
    }) as unknown as SourceTrack;
    recordAnonymously = vi.fn(async () => ({}));
  });

  afterEach(() => {
    realm.close();
    if (Realm.exists(config)) Realm.deleteFile(config);
  });

  afterAll(() => {
    Realm.shutdown();
  });

  const reporterFor = (accounts: ReturnType<typeof fakeAccounts>) =>
    new PlaybackHistoryReporter(
      { recordPlayback: recordAnonymously } as never,
      realm,
      accounts.accounts
    );

  const play = (reporter: PlaybackHistoryReporter, playlist = false) =>
    reporter.recordPlayback({
      playbackFlags: PlaybackFlags.Offline,
      playbackStartedAt: new Date('2026-11-19T01:00:00Z'),
      sourceTrack,
      playlistContext: playlist
        ? {
            playlistId: 'playlist_01890a5dac96774bbcceb302099a8071',
            entryId: 'playlist_entry_01890a5dac96774bbcceb302099a8072',
          }
        : undefined,
    })!;

  const unreported = () => realm.objects(PlaybackHistoryEntry).filtered('publishedAt == null');

  it('uploads a signed-in play to that account, and only there', async () => {
    const signedIn = fakeAccounts(accountA);
    signedIn.request.mockImplementation(async (_path: string, init: RequestInit) => ({
      contract_version: 1,
      results: JSON.parse(String(init.body)).plays.map((p: { play_id: string }) => ({
        play_id: p.play_id,
        status: 'accepted',
      })),
    }));
    const reporter = reporterFor(signedIn);
    const entry = play(reporter, true);

    await reporter.report();

    expect(signedIn.request).toHaveBeenCalledTimes(1);
    const [path, init] = signedIn.request.mock.calls[0];
    expect(path).toBe('/v1/history/plays:batch');
    expect(JSON.parse(init.body)).toEqual({
      contract_version: 1,
      plays: [
        {
          play_id: entry.playId,
          track_id: expect.stringMatching(/^track_/),
          qualified_at: entry.createdAt.toISOString(),
          started_at: '2026-11-19T01:00:00.000Z',
          app_type: 1,
          offline: true,
          origin: 'live',
          playlist_id: 'playlist_01890a5dac96774bbcceb302099a8071',
          playlist_entry_id: 'playlist_entry_01890a5dac96774bbcceb302099a8072',
          catalog_duration_ms: 381400,
        },
      ],
    });
    expect(entry.playId).toMatch(/^play_/);
    expect(recordAnonymously).not.toHaveBeenCalled();
    expect(unreported()).toHaveLength(0);
  });

  it('resends exactly the same play after a failed upload', async () => {
    const signedIn = fakeAccounts(accountA);
    signedIn.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      contract_version: 1,
      results: [{ play_id: null, status: 'rejected' }],
    });
    const reporter = reporterFor(signedIn);
    play(reporter);

    await reporter.report();
    expect(unreported()).toHaveLength(1);
    await reporter.report();

    const [first, second] = signedIn.request.mock.calls.map(([, init]) => init.body);
    expect(second).toBe(first);
    // Rejected is final too: the account will never take it, so it isn't sent again.
    expect(unreported()).toHaveLength(0);
  });

  it("keeps an account's plays waiting while another account is signed in", async () => {
    const accounts = fakeAccounts(accountA);
    const reporter = reporterFor(accounts);
    play(reporter);
    accounts.signInAs(accountB);

    await reporter.report();

    expect(accounts.request).not.toHaveBeenCalled();
    expect(recordAnonymously).not.toHaveBeenCalled();
    expect(unreported()).toHaveLength(1);
  });

  it('writes nothing for a response that arrives after an account switch', async () => {
    const accounts = fakeAccounts(accountA);
    accounts.request.mockImplementation(async () => {
      accounts.signInAs(accountB);
      return { contract_version: 1, results: [{ play_id: null, status: 'accepted' }] };
    });
    const reporter = reporterFor(accounts);
    play(reporter);

    await reporter.report();

    expect(unreported()).toHaveLength(1);
  });

  it('reports a signed-out play anonymously, skipping rows cleared meanwhile', async () => {
    const reporter = reporterFor(fakeAccounts(null));
    const entry = play(reporter);
    play(reporter);
    recordAnonymously.mockImplementationOnce(async () => {
      realm.write(() => realm.delete(realm.objects(PlaybackHistoryEntry)));
      return {};
    });

    await reporter.report();

    expect(entry.isValid()).toBe(false);
    expect(recordAnonymously).toHaveBeenCalledTimes(1);
    expect(recordAnonymously).toHaveBeenCalledWith(trackUuid);
  });

  it("forgets a deleted account's unsent plays and keeps the rest of history", async () => {
    const accounts = fakeAccounts(accountA);
    const reporter = reporterFor(accounts);
    const sent = play(reporter);
    realm.write(() => {
      sent.publishedAt = new Date();
    });
    play(reporter);
    accounts.signInAs(null);
    play(reporter);

    realm.write(() => forgetAccountPlays(realm, accountA));

    expect(realm.objects(PlaybackHistoryEntry).map((e) => e.destinationUserId ?? null)).toEqual([
      accountA,
      null,
    ]);
  });

  it('discards every unreported play when history is turned off', () => {
    const reporter = reporterFor(fakeAccounts(accountA));
    const sent = play(reporter);
    realm.write(() => {
      sent.publishedAt = new Date();
    });
    play(reporter);

    discardUnreportedPlays(realm);

    expect(realm.objects(PlaybackHistoryEntry)).toHaveLength(1);
    expect(unreported()).toHaveLength(0);
  });
});
