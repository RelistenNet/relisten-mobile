/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

interface LegacyRealmContents {
  playerState?: Partial<LegacyStateFixture>;
  catalogDuration?: number;
}

/** Each test owns one actual Realm file and every connection opened against it. */
class PlayerStateRealmFile {
  private directory = mkdtempSync(join(tmpdir(), 'relisten-checkpoint-'));
  private path = join(this.directory, 'player.realm');
  private connections: Realm[] = [];

  async writeLegacy(contents: LegacyRealmContents = {}) {
    const realm = await Realm.open({
      path: this.path,
      schemaVersion: 13,
      schema: [legacyPlayerState, sourceTrack],
    });
    this.connections.push(realm);
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
        ...contents.playerState,
      });
      if (contents.catalogDuration !== undefined) {
        realm.create('SourceTrack', { uuid: 'A', duration: contents.catalogDuration });
      }
    });
    realm.close();
  }

  async openCurrent() {
    const realm = await Realm.open({
      path: this.path,
      schemaVersion: 14,
      schema: [...PLAYER_STATE_SCHEMAS, sourceTrack],
      onMigration: migratePlayerState,
    });
    this.connections.push(realm);
    return realm;
  }

  dispose() {
    for (const realm of this.connections) {
      if (!realm.isClosed) {
        realm.close();
      }
    }
    rmSync(this.directory, { recursive: true, force: true });
  }
}

function duplicateQueueState(): PlayerStateProps {
  return {
    queueEntries: [
      { id: 'first-A', sourceTrackUuid: 'A' },
      { id: 'second-A', sourceTrackUuid: 'A' },
    ],
    shuffleOrder: { entryIds: ['second-A', 'first-A'] },
    repeatMode: PlayerRepeatState.REPEAT_TRACK,
    checkpoint: { entryId: 'second-A', elapsedSeconds: 10, durationSeconds: 300 },
    lastUpdatedAt: new Date(),
  };
}

describe('Realm playback checkpoints', () => {
  let file: PlayerStateRealmFile;

  beforeEach(() => {
    file = new PlayerStateRealmFile();
  });
  afterEach(() => {
    file.dispose();
  });

  it('preserves the selected duplicate occurrence in both orders after migration and reopen', async () => {
    await file.writeLegacy({
      playerState: {
        queueSourceTrackUuids: ['A', 'B', 'A', 'C'],
        queueSourceTrackShuffledUuids: ['A', 'A', 'C', 'B'],
        queueShuffleState: PlayerShuffleState.SHUFFLE_ON,
        activeSourceTrackIndex: 2,
        activeSourceTrackShuffledIndex: 0,
      },
      catalogDuration: 300,
    });

    const migrated = await file.openCurrent();
    const state = PlayerState.defaultObject(migrated)!;
    const [firstA, trackB, secondA, trackC] = state.queueEntries;
    const occurrenceIds = state.queueEntries.map((entry) => entry.id);
    expect(state.queueEntries.map((entry) => entry.sourceTrackUuid)).toEqual(['A', 'B', 'A', 'C']);
    expect(state.shuffleOrder?.entryIds.slice()).toEqual([
      secondA.id,
      firstA.id,
      trackC.id,
      trackB.id,
    ]);
    expect(state.checkpoint).toMatchObject({
      entryId: secondA.id,
      elapsedSeconds: 180,
      durationSeconds: 300,
    });
    expect(state.repeatMode).toBe(PlayerRepeatState.REPEAT_QUEUE);
    migrated.close();

    const reopened = PlayerState.defaultObject(await file.openCurrent())!;
    expect(reopened.queueEntries.map((entry) => entry.id)).toEqual(occurrenceIds);
    expect(reopened.shuffleOrder?.entryIds[0]).toBe(reopened.checkpoint?.entryId);
    expect(reopened.checkpoint?.elapsedSeconds).toBe(180);
  });

  it.each([
    { name: 'catalog duration', catalogDuration: 100, expected: 100 },
    { name: 'saved duration when the catalog has none', catalogDuration: undefined, expected: 150 },
  ])('clamps legacy elapsed to $name', async ({ catalogDuration, expected }) => {
    await file.writeLegacy({ catalogDuration });

    const state = PlayerState.defaultObject(await file.openCurrent())!;
    expect(state.checkpoint).toMatchObject({
      elapsedSeconds: expected,
      durationSeconds: expected,
    });
    expect(state.shuffleOrder).toBeNull();
  });

  it('preserves a queue without a selected entry', async () => {
    await file.writeLegacy({
      playerState: { activeSourceTrackIndex: null, activeSourceTrackShuffledIndex: null },
    });

    const state = PlayerState.defaultObject(await file.openCurrent())!;
    expect(state.queueEntries).toHaveLength(2);
    expect(state.checkpoint).toBeNull();
  });

  it('updates progress in place without replacing embedded queue records', async () => {
    const realm = await file.openCurrent();
    const initial = duplicateQueueState();
    const state = PlayerState.upsert(realm, initial);
    const originalEntry = state.queueEntries[0];
    const originalOrder = state.shuffleOrder!;
    const originalCheckpoint = state.checkpoint!;

    PlayerState.upsert(realm, {
      ...initial,
      checkpoint: { entryId: 'second-A', elapsedSeconds: 11 },
    });

    expect(originalEntry.isValid()).toBe(true);
    expect(originalOrder.isValid()).toBe(true);
    expect(originalCheckpoint.isValid()).toBe(true);
    expect(originalCheckpoint).toMatchObject({ elapsedSeconds: 11, durationSeconds: null });
  });

  it('saves queue removal, shuffle off, and cleared selection together across reopen', async () => {
    const realm = await file.openCurrent();
    const initial = duplicateQueueState();
    const state = PlayerState.upsert(realm, initial);
    const originalOrder = state.shuffleOrder!;
    const originalCheckpoint = state.checkpoint!;

    PlayerState.upsert(realm, {
      ...initial,
      queueEntries: [initial.queueEntries[0]],
      shuffleOrder: null,
      checkpoint: null,
    });
    expect(originalOrder.isValid()).toBe(false);
    expect(originalCheckpoint.isValid()).toBe(false);
    realm.close();

    const reopened = PlayerState.defaultObject(await file.openCurrent())!;
    expect(reopened.queueEntries.map((entry) => entry.id)).toEqual(['first-A']);
    expect(reopened.shuffleOrder).toBeNull();
    expect(reopened.checkpoint).toBeNull();
  });
});
