import { describe, expect, it } from 'vitest';
import {
  activePlaylistEntriesInQueueOrder,
  createCatalogQueueV2Items,
  createPlayablePlaylistQueueV2ItemsFromEntries,
  createPlaylistQueueV2ItemsFromEntries,
  createPlaylistQueueV2Item,
  flattenQueueV2ShuffleUnits,
  flattenQueueV2TrackShuffleUnits,
  isPlaylistEntryPlayable,
  migrateLegacyCatalogQueueStateToQueueV2,
  normalizeQueueV2ItemsForPersistence,
  QUEUE_V2_STATE_VERSION,
  queueV2HistoryAttribution,
  queueV2PlaybackCursor,
  queueV2ShuffleUnits,
  queueV2TrackShuffleUnits,
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
      blockUuid: 'block-1',
      blockPosition: 1,
    });

    expect(firstEntry.queueItemId).toBe('playlist:playlist-1:entry:entry-1');
    expect(secondEntry.queueItemId).toBe('playlist:playlist-1:entry:entry-2');
    expect(firstEntry.queueItemId).not.toBe(secondEntry.queueItemId);
    expect(queueV2PlaybackCursor(secondEntry)).toBe('entry-2');
    expect(queueV2HistoryAttribution(secondEntry)).toEqual({
      sourceTrackUuid: 'track-a',
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-2',
      blockUuid: 'block-1',
      blockPosition: 1,
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

  it('groups runtime tracks by Queue V2 block shuffle units', () => {
    const blockedFirst = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-1',
      sourceTrackUuid: 'track-a',
      blockUuid: 'block-a',
      blockPosition: 1,
    });
    const blockedSecond = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-2',
      sourceTrackUuid: 'track-b',
      blockUuid: 'block-a',
      blockPosition: 0,
    });
    const standalone = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-3',
      sourceTrackUuid: 'track-c',
    });

    const units = queueV2TrackShuffleUnits([
      { identifier: 'runtime-1', queueV2Item: blockedFirst },
      { identifier: 'runtime-2', queueV2Item: standalone },
      { identifier: 'runtime-3', queueV2Item: blockedSecond },
    ]);

    expect(units.map((unit) => unit.key)).toEqual([
      'playlist:playlist-1:block:block-a',
      'item:playlist:playlist-1:entry:entry-3',
    ]);
    expect(units[0].tracks.map((track) => track.identifier)).toEqual(['runtime-3', 'runtime-1']);
  });

  it('preserves duplicate runtime tracks that share a Queue V2 item id', () => {
    const duplicateCatalogItem = createCatalogQueueV2Items(['track-a'])[0];
    const units = queueV2TrackShuffleUnits([
      { identifier: 'runtime-1', queueV2Item: duplicateCatalogItem },
      { identifier: 'runtime-2', queueV2Item: duplicateCatalogItem },
    ]);

    expect(flattenQueueV2TrackShuffleUnits(units).map((track) => track.identifier)).toEqual([
      'runtime-1',
      'runtime-2',
    ]);
  });

  it('builds playlist queue items in fractional playlist order', () => {
    const items = createPlaylistQueueV2ItemsFromEntries([
      {
        uuid: 'entry-b',
        playlistUuid: 'playlist-1',
        sourceTrackUuid: 'track-a',
        position: 'b',
        title: 'Second A',
      },
      {
        uuid: 'entry-a',
        playlistUuid: 'playlist-1',
        sourceTrackUuid: 'track-a',
        position: 'a',
        blockUuid: 'block-1',
        blockPosition: 1,
        title: 'First A',
      },
      {
        uuid: 'entry-a0',
        playlistUuid: 'playlist-1',
        sourceTrackUuid: 'track-b',
        position: 'a0',
        blockUuid: 'block-1',
        blockPosition: 0,
      },
    ]);

    expect(items.map((item) => item.queueItemId)).toEqual([
      'playlist:playlist-1:entry:entry-a',
      'playlist:playlist-1:entry:entry-a0',
      'playlist:playlist-1:entry:entry-b',
    ]);
    expect(items[0]).toEqual({
      kind: 'playlist',
      queueItemId: 'playlist:playlist-1:entry:entry-a',
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-a',
      sourceTrackUuid: 'track-a',
      blockUuid: 'block-1',
      blockPosition: 1,
      title: 'First A',
    });
  });

  it('excludes deleted playlist entries but preserves unavailable item identity', () => {
    const activeUnavailableEntry = {
      uuid: 'entry-unavailable',
      playlistUuid: 'playlist-1',
      sourceTrackUuid: 'track-a',
      position: '2',
      unavailableReason: 'missing_source_track',
    };

    const orderedEntries = activePlaylistEntriesInQueueOrder([
      {
        uuid: 'entry-deleted',
        playlistUuid: 'playlist-1',
        sourceTrackUuid: 'track-a',
        position: '1',
        deletedAt: new Date('2026-06-20T00:00:00.000Z'),
      },
      activeUnavailableEntry,
      {
        uuid: 'entry-available',
        playlistUuid: 'playlist-1',
        sourceTrackUuid: 'track-b',
        position: '10',
      },
    ]);
    const items = createPlaylistQueueV2ItemsFromEntries(orderedEntries);

    expect(orderedEntries.map((entry) => entry.uuid)).toEqual([
      'entry-unavailable',
      'entry-available',
    ]);
    expect(items.map((item) => item.playlistEntryUuid)).toEqual([
      'entry-unavailable',
      'entry-available',
    ]);
    expect(isPlaylistEntryPlayable(activeUnavailableEntry)).toBe(false);
  });

  it('builds only playable hydrated playlist queue items', () => {
    const items = createPlayablePlaylistQueueV2ItemsFromEntries(
      [
        {
          uuid: 'entry-a',
          playlistUuid: 'playlist-1',
          sourceTrackUuid: 'track-a',
          position: 'a',
        },
        {
          uuid: 'entry-missing-track',
          playlistUuid: 'playlist-1',
          sourceTrackUuid: 'track-missing',
          position: 'b',
        },
        {
          uuid: 'entry-unavailable',
          playlistUuid: 'playlist-1',
          sourceTrackUuid: 'track-a',
          position: 'c',
          unavailableReason: 'missing_source_track',
        },
        {
          uuid: 'entry-a-duplicate',
          playlistUuid: 'playlist-1',
          sourceTrackUuid: 'track-a',
          position: 'd',
        },
      ],
      (sourceTrackUuid) => sourceTrackUuid === 'track-a'
    );

    expect(items.map((item) => item.queueItemId)).toEqual([
      'playlist:playlist-1:entry:entry-a',
      'playlist:playlist-1:entry:entry-a-duplicate',
    ]);
    expect(items.map((item) => item.sourceTrackUuid)).toEqual(['track-a', 'track-a']);
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
      (sourceTrackUuid, queueItem) =>
        queueItem ? { sourceTrackUuid, queueItemId: queueItem.queueItemId } : undefined
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
      (sourceTrackUuid, queueItem) => ({
        sourceTrackUuid,
        queueItemId: queueItem?.queueItemId,
      })
    );

    expect(plan.usedQueueV2State).toBe(false);
    expect(plan.orderedTracks.map((track) => track.sourceTrackUuid)).toEqual([
      'track-a',
      'track-b',
      'track-a',
    ]);
    expect(plan.orderedTracks.map((track) => track.queueItemId)).toEqual([
      'catalog:track-a:0',
      'catalog:track-b:0',
      'catalog:track-a:1',
    ]);
    expect(plan.shuffledTracks.map((track) => track.queueItemId)).toEqual([
      'catalog:track-a:0',
      'catalog:track-a:1',
      'catalog:track-b:0',
    ]);
    expect(plan.currentTrack?.sourceTrackUuid).toBe('track-a');
    expect(plan.currentTrack?.queueItemId).toBe('catalog:track-a:1');
  });

  it('uses the opposite legacy index when the active-order legacy index is unavailable', () => {
    const plan = resolveQueueV2RestorePlan(
      {
        legacySourceTrackUuids: ['track-a', 'track-b', 'track-c'],
        legacyShuffledSourceTrackUuids: ['track-b', 'track-c', 'track-a'],
        legacyCurrentIndex: 2,
        legacyShuffledCurrentIndex: undefined,
        useShuffledOrder: true,
      },
      (sourceTrackUuid, queueItem) => ({
        sourceTrackUuid,
        queueItemId: queueItem?.queueItemId,
      })
    );

    expect(plan.usedQueueV2State).toBe(false);
    expect(plan.currentTrack).toEqual({
      sourceTrackUuid: 'track-c',
      queueItemId: 'catalog:track-c:0',
    });
  });

  it('normalizes duplicate catalog queue item ids during persistence', () => {
    const duplicateDefaultItem = createCatalogQueueV2Items(['track-a'])[0];
    const playlistItem = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-1',
      sourceTrackUuid: 'track-a',
    });

    const items = normalizeQueueV2ItemsForPersistence(
      [
        { sourceTrackUuid: 'track-a', queueV2Item: duplicateDefaultItem },
        { sourceTrackUuid: 'track-b', queueV2Item: createCatalogQueueV2Items(['track-b'])[0] },
        { sourceTrackUuid: 'track-a', queueV2Item: duplicateDefaultItem },
        { sourceTrackUuid: 'track-a', queueV2Item: playlistItem },
      ],
      (track) => track.sourceTrackUuid,
      (track) => track.queueV2Item
    );

    expect(items.map((item) => item.queueItemId)).toEqual([
      'catalog:track-a:0',
      'catalog:track-b:0',
      'catalog:track-a:1',
      'playlist:playlist-1:entry:entry-1',
    ]);
  });

  it('normalizes repeated runtime track aliases without mutating their carried metadata', () => {
    const aliasedTrack = {
      sourceTrackUuid: 'track-a',
      queueV2Item: createCatalogQueueV2Items(['track-a'])[0],
    };

    const items = normalizeQueueV2ItemsForPersistence(
      [aliasedTrack, aliasedTrack],
      (track) => track.sourceTrackUuid,
      (track) => track.queueV2Item
    );

    expect(items.map((item) => item.queueItemId)).toEqual([
      'catalog:track-a:0',
      'catalog:track-a:1',
    ]);
    expect(aliasedTrack.queueV2Item.queueItemId).toBe('catalog:track-a:0');
  });
});
