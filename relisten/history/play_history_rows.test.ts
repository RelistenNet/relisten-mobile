/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { discardUnreportedPlays } from './play_history_rows';

/** The catalog rows a play links to, reduced to their keys. */
const HISTORY_LINK_STUBS: Realm.ObjectSchema[] = ['SourceTrack', 'Artist', 'Show', 'Source'].map(
  (name) => ({ name, primaryKey: 'uuid', properties: { uuid: 'string' } })
);

describe('play history rows', () => {
  let directory: string;
  let realm: Realm;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-play-history-'));
    realm = await Realm.open({
      path: join(directory, 'history.realm'),
      schema: [PlaybackHistoryEntry, ...HISTORY_LINK_STUBS],
    });
  });

  afterEach(() => {
    realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('discards every unreported play when history is turned off, and keeps reported ones', () => {
    realm.write(() => {
      const link = (name: string) => realm.create(name, { uuid: name });
      const links = {
        sourceTrack: link('SourceTrack'),
        artist: link('Artist'),
        show: link('Show'),
        source: link('Source'),
      };
      const now = new Date();
      for (const [uuid, publishedAt, destinationUserId] of [
        ['reported', now, undefined],
        ['anonymous', undefined, undefined],
        ['account', undefined, 'user_01890a5dac96774bbcceb302099a8051'],
      ] as const) {
        realm.create(PlaybackHistoryEntry, {
          uuid,
          playbackFlags: 0,
          createdAt: now,
          playbackStartedAt: now,
          publishedAt,
          destinationUserId,
          ...links,
        } as never);
      }
    });

    discardUnreportedPlays(realm);

    expect(realm.objects(PlaybackHistoryEntry).map((entry) => entry.uuid)).toEqual(['reported']);
  });
});
