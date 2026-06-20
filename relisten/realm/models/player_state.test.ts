import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { describe, expect, it } from 'vitest';
import { createCatalogQueueV2Items, QUEUE_V2_STATE_VERSION } from '@/relisten/player/queue_v2';
import { PlayerState } from '@/relisten/realm/models/player_state';

function openTempPlayerStateRealm() {
  const tempDir = mkdtempSync(join(tmpdir(), 'relisten-player-state-'));
  const realm = new Realm({
    path: join(tempDir, 'test.realm'),
    schema: [PlayerState],
    schemaVersion: 1,
  });

  return {
    realm,
    cleanup: () => {
      realm.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

describe('PlayerState Queue V2 persistence', () => {
  it('stores Queue V2 catalog metadata alongside legacy source-track arrays', () => {
    const { realm, cleanup } = openTempPlayerStateRealm();

    try {
      const items = createCatalogQueueV2Items(['track-a', 'track-b']);
      const state = PlayerState.upsert(realm, {
        queueShuffleState: 1,
        queueRepeatState: 1,
        queueSourceTrackUuids: ['track-a', 'track-b'],
        queueSourceTrackShuffledUuids: ['track-b', 'track-a'],
        queueV2SchemaVersion: QUEUE_V2_STATE_VERSION,
        queueV2ItemsJson: JSON.stringify(items),
        queueV2ShuffledQueueItemIds: [items[1].queueItemId, items[0].queueItemId],
        queueV2CurrentItemKey: items[1].queueItemId,
        activeSourceTrackIndex: 1,
        activeSourceTrackShuffledIndex: 0,
        lastUpdatedAt: new Date('2026-06-20T01:20:00Z'),
      });

      expect(Array.from(state.queueSourceTrackUuids)).toEqual(['track-a', 'track-b']);
      expect(Array.from(state.queueSourceTrackShuffledUuids)).toEqual(['track-b', 'track-a']);
      expect(state.queueV2SchemaVersion).toBe(QUEUE_V2_STATE_VERSION);
      expect(JSON.parse(state.queueV2ItemsJson ?? '')).toEqual(items);
      expect(Array.from(state.queueV2ShuffledQueueItemIds)).toEqual([
        items[1].queueItemId,
        items[0].queueItemId,
      ]);
      expect(state.queueV2CurrentItemKey).toBe(items[1].queueItemId);
    } finally {
      cleanup();
    }
  });

  it('keeps Queue V2 list fields safe when legacy-only state is written', () => {
    const { realm, cleanup } = openTempPlayerStateRealm();

    try {
      const state = PlayerState.upsert(realm, {
        queueShuffleState: 1,
        queueRepeatState: 1,
        queueSourceTrackUuids: ['track-a'],
        queueSourceTrackShuffledUuids: ['track-a'],
        lastUpdatedAt: new Date('2026-06-20T01:20:00Z'),
      });

      expect(state.queueV2SchemaVersion).toBeNull();
      expect(state.queueV2ItemsJson).toBeNull();
      expect(Array.from(state.queueV2ShuffledQueueItemIds)).toEqual([]);
      expect(state.queueV2CurrentItemKey).toBeNull();
    } finally {
      cleanup();
    }
  });
});
