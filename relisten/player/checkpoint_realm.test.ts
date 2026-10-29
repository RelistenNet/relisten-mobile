/// <reference types="node" />
import { afterEach, describe, expect, it } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PLAYER_STATE_SCHEMAS,
  PLAYER_STATE_SENTINEL,
  PlayerState,
  PlayerStateProps,
} from '@/relisten/realm/models/player_state';
import { migratePlayerState } from '@/relisten/realm/models/player_state_migration';
import { PlayerRepeatState, PlayerShuffleState } from './player_modes';

// This is the shipped schema, independent of the schema being tested.
const legacyPlayerState: Realm.ObjectSchema = {
  name: 'PlayerState',
  primaryKey: 'id',
  properties: {
    id: 'string',
    queueShuffleState: 'int',
    queueRepeatState: 'int',
    queueSourceTrackUuids: 'string[]',
    queueSourceTrackShuffledUuids: 'string[]',
    activeSourceTrackIndex: 'int?',
    activeSourceTrackShuffledIndex: 'int?',
    lastUpdatedAt: 'date',
    progress: 'float?',
    duration: 'float?',
    elapsed: 'float?',
  },
};
const sourceTrack: Realm.ObjectSchema = {
  name: 'SourceTrack',
  primaryKey: 'uuid',
  properties: { uuid: 'string', duration: 'double?' },
};
interface LegacyStateFixture {
  queueSourceTrackUuids: string[];
  queueSourceTrackShuffledUuids: string[];
  queueShuffleState: PlayerShuffleState;
  activeSourceTrackIndex: number | null;
  activeSourceTrackShuffledIndex: number | null;
}

const directories: string[] = [];
const openedRealms: Realm[] = [];
afterEach(() => {
  for (const realm of openedRealms.splice(0)) if (!realm.isClosed) realm.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function realmPath() {
  const directory = mkdtempSync(join(tmpdir(), 'relisten-checkpoint-'));
  directories.push(directory);
  return join(directory, 'player.realm');
}

async function openCurrent(path: string) {
  const realm = await Realm.open({
    path,
    schemaVersion: 14,
    schema: [...PLAYER_STATE_SCHEMAS, sourceTrack],
    onMigration: migratePlayerState,
  });
  openedRealms.push(realm);
  return realm;
}

async function createLegacy(
  path: string,
  fixture: Partial<LegacyStateFixture> = {},
  catalogDuration?: number
) {
  const realm = await Realm.open({
    path,
    schemaVersion: 13,
    schema: [legacyPlayerState, sourceTrack],
  });
  openedRealms.push(realm);
  realm.write(() => {
    realm.create('PlayerState', {
      id: PLAYER_STATE_SENTINEL,
      queueShuffleState: PlayerShuffleState.SHUFFLE_OFF,
      queueRepeatState: PlayerRepeatState.REPEAT_QUEUE,
      queueSourceTrackUuids: ['A', 'B'],
      queueSourceTrackShuffledUuids: ['B', 'A'],
      activeSourceTrackIndex: 0,
      activeSourceTrackShuffledIndex: 1,
      lastUpdatedAt: new Date('2026-10-20T12:00:00Z'),
      elapsed: 180,
      duration: 150,
      progress: 1,
      ...fixture,
    });
    if (catalogDuration !== undefined)
      realm.create('SourceTrack', { uuid: 'A', duration: catalogDuration });
  });
  realm.close();
}

describe('Realm playback checkpoints', () => {
  it('migrates duplicate queue occurrences and preserves the selected original/shuffled pair after reopening', async () => {
    const path = realmPath();
    await createLegacy(
      path,
      {
        queueSourceTrackUuids: ['A', 'B', 'A', 'C'],
        queueSourceTrackShuffledUuids: ['A', 'A', 'C', 'B'],
        queueShuffleState: PlayerShuffleState.SHUFFLE_ON,
        activeSourceTrackIndex: 2,
        activeSourceTrackShuffledIndex: 0,
      },
      300
    );
    const migrated = await openCurrent(path);
    const state = PlayerState.defaultObject(migrated)!;
    const ids = state.queueEntries.map((entry) => entry.id);
    expect(state.queueEntries.map((entry) => entry.sourceTrackUuid)).toEqual(['A', 'B', 'A', 'C']);
    expect(state.shuffleOrder?.entryIds.slice()).toEqual([ids[2], ids[0], ids[3], ids[1]]);
    expect(state.checkpoint?.entryId).toBe(ids[2]);
    expect(state.checkpoint?.elapsedSeconds).toBe(180);
    expect(state.checkpoint?.durationSeconds).toBe(300);
    expect(state.repeatMode).toBe(PlayerRepeatState.REPEAT_QUEUE);
    migrated.close();

    const reopened = PlayerState.defaultObject(await openCurrent(path))!;
    expect(reopened.queueEntries.map((entry) => entry.id)).toEqual(ids);
    expect(reopened.shuffleOrder?.entryIds[0]).toBe(reopened.checkpoint?.entryId);
    expect(reopened.checkpoint?.elapsedSeconds).toBe(180);
  });

  it.each([
    { catalogDuration: 100, expected: 100 },
    { catalogDuration: undefined, expected: 150 },
  ])(
    'clamps legacy elapsed to catalog duration or saved duration: $expected',
    async ({ catalogDuration, expected }) => {
      const path = realmPath();
      await createLegacy(path, {}, catalogDuration);
      const state = PlayerState.defaultObject(await openCurrent(path))!;
      expect(state.checkpoint?.elapsedSeconds).toBe(expected);
      expect(state.checkpoint?.durationSeconds).toBe(expected);
      expect(state.shuffleOrder).toBeNull();
    }
  );

  it('preserves a queue without a selected entry', async () => {
    const path = realmPath();
    await createLegacy(path, {
      activeSourceTrackIndex: null,
      activeSourceTrackShuffledIndex: null,
    });
    const state = PlayerState.defaultObject(await openCurrent(path))!;
    expect(state.queueEntries.length).toBe(2);
    expect(state.checkpoint).toBeNull();
  });

  it('updates progress without replacing the embedded queue, then saves removal and selection atomically', async () => {
    const path = realmPath();
    const realm = await openCurrent(path);
    const props: PlayerStateProps = {
      queueEntries: [
        { id: 'first', sourceTrackUuid: 'A' },
        { id: 'second', sourceTrackUuid: 'A' },
      ],
      shuffleOrder: { entryIds: ['second', 'first'] },
      repeatMode: PlayerRepeatState.REPEAT_TRACK,
      checkpoint: {
        entryId: 'second',
        elapsedSeconds: 10,
        durationSeconds: 300,
      },
      lastUpdatedAt: new Date(),
    };
    const state = PlayerState.upsert(realm, props);
    const entry = state.queueEntries[0];
    const order = state.shuffleOrder!;
    const checkpoint = state.checkpoint!;
    PlayerState.upsert(realm, {
      ...props,
      checkpoint: { entryId: 'second', elapsedSeconds: 11 },
    });
    expect(entry.isValid()).toBe(true);
    expect(order.isValid()).toBe(true);
    expect(checkpoint.isValid()).toBe(true);
    expect(checkpoint.elapsedSeconds).toBe(11);
    expect(checkpoint.durationSeconds).toBeNull();

    PlayerState.upsert(realm, {
      ...props,
      queueEntries: [props.queueEntries[0]],
      shuffleOrder: null,
      checkpoint: null,
    });
    expect(order.isValid()).toBe(false);
    expect(checkpoint.isValid()).toBe(false);
    realm.close();
    const reopened = PlayerState.defaultObject(await openCurrent(path))!;
    expect(reopened.queueEntries.map((entry) => entry.id)).toEqual(['first']);
    expect(reopened.shuffleOrder).toBeNull();
    expect(reopened.checkpoint).toBeNull();
  });
});
