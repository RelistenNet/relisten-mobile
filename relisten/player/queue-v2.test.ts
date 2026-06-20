import { describe, expect, it } from 'vitest';
import {
  createCatalogQueueV2Items,
  createPlaylistQueueV2Item,
  flattenQueueV2ShuffleUnits,
  migrateLegacyCatalogQueueStateToQueueV2,
  QUEUE_V2_STATE_VERSION,
  queueV2HistoryAttribution,
  queueV2PlaybackCursor,
  queueV2ShuffleUnits,
  resolveQueueV2RestorePlan,
} from '@/relisten/player/queue_v2';

describe('Queue V2 identity', () => {
  it('migrates legacy catalog queues into explicit queue item ids', () => {
    const migrated = migrateLegacyCatalogQueueStateToQueueV2({
      queueSourceTrackUuids: ['track-a', 'track-b', 'track-a'],
      queueSourceTrackShuffledUuids: ['track-a', 'track-a', 'track-b'],
      activeSourceTrackIndex: 2,
      activeSourceTrackShuffledIndex: 1,
      activeQueueOrder: 'shuffled',
    });

    expect(migrated.schemaVersion).toBe(QUEUE_V2_STATE_VERSION);
    expect(migrated.items).toEqual([
      { kind: 'catalog', queueItemId: 'catalog:track-a:0', sourceTrackUuid: 'track-a' },
      { kind: 'catalog', queueItemId: 'catalog:track-b:0', sourceTrackUuid: 'track-b' },
      { kind: 'catalog', queueItemId: 'catalog:track-a:1', sourceTrackUuid: 'track-a' },
    ]);
    expect(migrated.shuffledQueueItemIds).toEqual([
      'catalog:track-a:0',
      'catalog:track-a:1',
      'catalog:track-b:0',
    ]);
    expect(migrated.currentItemKey).toBe('catalog:track-a:1');
  });

  it('chooses one current item key when legacy duplicate indexes disagree', () => {
    const shuffledCurrent = migrateLegacyCatalogQueueStateToQueueV2({
      queueSourceTrackUuids: ['track-a', 'track-b', 'track-a'],
      queueSourceTrackShuffledUuids: ['track-a', 'track-a', 'track-b'],
      activeSourceTrackIndex: 2,
      activeSourceTrackShuffledIndex: 0,
      activeQueueOrder: 'shuffled',
    });
    const originalCurrent = migrateLegacyCatalogQueueStateToQueueV2({
      queueSourceTrackUuids: ['track-a', 'track-b', 'track-a'],
      queueSourceTrackShuffledUuids: ['track-a', 'track-a', 'track-b'],
      activeSourceTrackIndex: 2,
      activeSourceTrackShuffledIndex: 0,
      activeQueueOrder: 'original',
    });

    expect(shuffledCurrent.currentItemKey).toBe('catalog:track-a:0');
    expect(originalCurrent.currentItemKey).toBe('catalog:track-a:1');
  });

  it('keeps duplicate playlist source tracks distinct by playlist entry id', () => {
    const firstEntry = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-1',
      sourceTrackUuid: 'track-a',
    });
    const secondEntry = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-2',
      sourceTrackUuid: 'track-a',
    });

    expect(firstEntry.queueItemId).toBe('playlist:playlist-1:entry:entry-1');
    expect(secondEntry.queueItemId).toBe('playlist:playlist-1:entry:entry-2');
    expect(firstEntry.queueItemId).not.toBe(secondEntry.queueItemId);
    expect(queueV2PlaybackCursor(secondEntry)).toBe('entry-2');
    expect(queueV2HistoryAttribution(secondEntry)).toEqual({
      sourceTrackUuid: 'track-a',
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-2',
    });
  });

  it('groups playlist blocks for shuffle without collapsing standalone entries', () => {
    const blockedFirst = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-1',
      sourceTrackUuid: 'track-a',
      blockUuid: 'block-a',
      blockPosition: 1,
    });
    const standaloneA = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-2',
      sourceTrackUuid: 'track-b',
    });
    const blockedSecond = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-3',
      sourceTrackUuid: 'track-c',
      blockUuid: 'block-a',
      blockPosition: 0,
    });
    const standaloneB = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-4',
      sourceTrackUuid: 'track-d',
    });
    const catalogItem = createCatalogQueueV2Items(['track-e'])[0];

    const units = queueV2ShuffleUnits([
      blockedFirst,
      standaloneA,
      blockedSecond,
      standaloneB,
      catalogItem,
    ]);

    expect(units.map((unit) => unit.key)).toEqual([
      'playlist:playlist-1:block:block-a',
      'item:playlist:playlist-1:entry:entry-2',
      'item:playlist:playlist-1:entry:entry-4',
      'item:catalog:track-e:0',
    ]);
    expect(units[0].items.map((item) => item.queueItemId)).toEqual([
      blockedSecond.queueItemId,
      blockedFirst.queueItemId,
    ]);
    expect(flattenQueueV2ShuffleUnits(units).map((item) => item.queueItemId)).toEqual([
      blockedSecond.queueItemId,
      blockedFirst.queueItemId,
      standaloneA.queueItemId,
      standaloneB.queueItemId,
      catalogItem.queueItemId,
    ]);
  });

  it('restores duplicate catalog occurrences by Queue V2 current item key', () => {
    const items = createCatalogQueueV2Items(['track-a', 'track-b', 'track-a']);
    const plan = resolveQueueV2RestorePlan(
      {
        queueV2Items: items,
        queueV2ShuffledQueueItemIds: [
          items[2].queueItemId,
          items[0].queueItemId,
          items[1].queueItemId,
        ],
        queueV2CurrentItemKey: items[2].queueItemId,
        legacySourceTrackUuids: ['track-a', 'track-b', 'track-a'],
        legacyShuffledSourceTrackUuids: ['track-a', 'track-a', 'track-b'],
        legacyCurrentIndex: 0,
        legacyShuffledCurrentIndex: 1,
        useShuffledOrder: true,
      },
      (sourceTrackUuid, queueItemId) =>
        queueItemId ? { sourceTrackUuid, queueItemId } : undefined,
      (track) => track.sourceTrackUuid
    );

    expect(plan.usedQueueV2State).toBe(true);
    expect(plan.orderedTracks.map((track) => track.queueItemId)).toEqual([
      items[0].queueItemId,
      items[1].queueItemId,
      items[2].queueItemId,
    ]);
    expect(plan.shuffledTracks.map((track) => track.queueItemId)).toEqual([
      items[2].queueItemId,
      items[0].queueItemId,
      items[1].queueItemId,
    ]);
    expect(plan.currentTrack?.queueItemId).toBe(items[2].queueItemId);
  });

  it('falls back to legacy restore indexes when Queue V2 state is unavailable', () => {
    const plan = resolveQueueV2RestorePlan(
      {
        legacySourceTrackUuids: ['track-a', 'track-b', 'track-a'],
        legacyShuffledSourceTrackUuids: ['track-a', 'track-a', 'track-b'],
        legacyCurrentIndex: 0,
        legacyShuffledCurrentIndex: 1,
        useShuffledOrder: true,
      },
      (sourceTrackUuid) => ({ sourceTrackUuid }),
      (track) => track.sourceTrackUuid
    );

    expect(plan.usedQueueV2State).toBe(false);
    expect(plan.orderedTracks.map((track) => track.sourceTrackUuid)).toEqual([
      'track-a',
      'track-b',
      'track-a',
    ]);
    expect(plan.currentTrack?.sourceTrackUuid).toBe('track-a');
  });
});
