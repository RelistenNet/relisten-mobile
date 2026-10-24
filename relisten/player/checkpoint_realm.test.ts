/// <reference types="node" />
import { afterEach, describe, expect, it } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlayerState } from '@/relisten/realm/models/player_state';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('Realm checkpoint schema compatibility', () => {
  it('migrates schema 13 data without native checkpoint fields and writes a coherent schema 14 record', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'relisten-checkpoint-'));
    directories.push(directory);
    const path = join(directory, 'player.realm');
    const properties = { ...PlayerState.schema.properties };
    delete properties.queueTrackIdentifiers;
    delete properties.queueTrackShuffledIdentifiers;
    delete properties.activeSourceTrackUuid;
    delete properties.nativeSequence;
    delete properties.nativeCheckpointEnabled;
    const old = await Realm.open({
      path,
      schemaVersion: 13,
      schema: [{ ...PlayerState.schema, properties }],
    });
    old.write(() =>
      old.create('PlayerState', {
        id: 'player_state',
        queueShuffleState: 1,
        queueRepeatState: 1,
        queueSourceTrackUuids: ['A', 'B'],
        queueSourceTrackShuffledUuids: ['B', 'A'],
        activeSourceTrackIndex: 0,
        activeSourceTrackShuffledIndex: 1,
        lastUpdatedAt: new Date(),
        elapsed: 120,
        duration: 381,
        progress: 120 / 381,
      })
    );
    old.close();
    const realm = await Realm.open({ path, schemaVersion: 14, schema: [PlayerState] });
    try {
      const restored = PlayerState.defaultObject(realm)!;
      expect(restored.queueTrackIdentifiers.length).toBe(0);
      expect(restored.nativeSequence == null).toBe(true);
      expect(restored.elapsed).toBe(120);
      PlayerState.upsert(realm, {
        queueShuffleState: 1,
        queueRepeatState: 1,
        queueSourceTrackUuids: ['A', 'B'],
        queueSourceTrackShuffledUuids: ['B', 'A'],
        queueTrackIdentifiers: ['entry-A', 'entry-B'],
        queueTrackShuffledIdentifiers: ['entry-B', 'entry-A'],
        activeSourceTrackIndex: 1,
        activeSourceTrackShuffledIndex: 0,
        activeSourceTrackUuid: 'B',
        nativeSequence: 99,
        nativeCheckpointEnabled: true,
        lastUpdatedAt: new Date(),
        elapsed: 12,
        duration: 410,
        progress: 12 / 410,
      });
      expect(restored.activeSourceTrackUuid).toBe('B');
      expect(restored.queueTrackIdentifiers[restored.activeSourceTrackIndex!]).toBe('entry-B');
      expect(restored.elapsed).toBe(12);
      expect(restored.nativeSequence).toBe(99);
    } finally {
      realm.close();
    }
  });
});
