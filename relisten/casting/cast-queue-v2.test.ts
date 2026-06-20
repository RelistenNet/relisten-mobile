import { describe, expect, it } from 'vitest';
import {
  buildQueueV2CastCustomDataPayloads,
  buildQueueV2CastMediaInfoData,
  buildQueueV2CastQueueItemData,
  castStatusRuntimeIdentifierForLocalQueue,
} from '@/relisten/casting/cast_queue_v2';
import { createCatalogQueueV2Item, createPlaylistQueueV2Item } from '@/relisten/player/queue_v2';

describe('Cast Queue V2 custom data', () => {
  it('keeps legacy media info identifiers separate from queue item custom data', () => {
    const payloads = buildQueueV2CastCustomDataPayloads({
      runtimeIdentifier: 'runtime-1',
      sourceTrackUuid: 'source-track-1',
      queueV2Item: createCatalogQueueV2Item('source-track-1'),
    });

    expect(payloads).toEqual({
      queueItemCustomData: {
        identifier: 'runtime-1',
        queueV2Kind: 'catalog',
        queueV2ItemId: 'catalog:source-track-1:0',
        sourceTrackUuid: 'source-track-1',
      },
      mediaInfoCustomData: {
        identifier: 'runtime-1',
        sourceTrackUuid: 'source-track-1',
      },
    });
    expect(
      buildQueueV2CastMediaInfoData({
        runtimeIdentifier: 'runtime-1',
        sourceTrackUuid: 'source-track-1',
        queueV2Item: createCatalogQueueV2Item('source-track-1'),
      })
    ).toEqual({
      identifier: 'runtime-1',
      sourceTrackUuid: 'source-track-1',
    });
  });

  it('includes catalog Queue V2 identity in queue item custom data', () => {
    expect(
      buildQueueV2CastQueueItemData({
        runtimeIdentifier: 'runtime-1',
        sourceTrackUuid: 'source-track-1',
        queueV2Item: createCatalogQueueV2Item('source-track-1'),
      })
    ).toEqual({
      identifier: 'runtime-1',
      queueV2Kind: 'catalog',
      queueV2ItemId: 'catalog:source-track-1:0',
      sourceTrackUuid: 'source-track-1',
    });
  });

  it('includes playlist entry identity for duplicate source tracks', () => {
    const firstEntryData = buildQueueV2CastQueueItemData({
      runtimeIdentifier: 'runtime-1',
      sourceTrackUuid: 'source-track-1',
      queueV2Item: createPlaylistQueueV2Item({
        playlistUuid: 'playlist-1',
        playlistEntryUuid: 'entry-1',
        sourceTrackUuid: 'source-track-1',
        blockUuid: 'block-1',
        blockPosition: 0,
      }),
    });
    const secondEntryData = buildQueueV2CastQueueItemData({
      runtimeIdentifier: 'runtime-2',
      sourceTrackUuid: 'source-track-1',
      queueV2Item: createPlaylistQueueV2Item({
        playlistUuid: 'playlist-1',
        playlistEntryUuid: 'entry-2',
        sourceTrackUuid: 'source-track-1',
        blockUuid: 'block-1',
        blockPosition: 1,
      }),
    });

    expect(firstEntryData).toEqual({
      identifier: 'runtime-1',
      queueV2Kind: 'playlist',
      queueV2ItemId: 'playlist:playlist-1:entry:entry-1',
      sourceTrackUuid: 'source-track-1',
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-1',
      blockUuid: 'block-1',
      blockPosition: 0,
    });
    expect(secondEntryData).toEqual({
      ...firstEntryData,
      identifier: 'runtime-2',
      queueV2ItemId: 'playlist:playlist-1:entry:entry-2',
      playlistEntryUuid: 'entry-2',
      blockPosition: 1,
    });
  });

  it('reconciles Cast status by Queue V2 item id before stale runtime identifiers', () => {
    const queueV2Item = createPlaylistQueueV2Item({
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-1',
      sourceTrackUuid: 'source-track-1',
    });

    expect(
      castStatusRuntimeIdentifierForLocalQueue(
        {
          customData: {
            queueV2ItemId: queueV2Item.queueItemId,
          },
          mediaInfo: {
            customData: {
              identifier: 'stale-runtime-id',
            },
          },
        },
        [
          {
            identifier: 'local-runtime-id',
            queueV2Item,
          },
        ]
      )
    ).toBe('local-runtime-id');
  });

  it('prefers an exact local runtime identifier when duplicate Queue V2 item ids exist', () => {
    const queueV2Item = createCatalogQueueV2Item('source-track-1');

    expect(
      castStatusRuntimeIdentifierForLocalQueue(
        {
          customData: {
            queueV2ItemId: queueV2Item.queueItemId,
          },
          mediaInfo: {
            customData: {
              identifier: 'runtime-2',
            },
          },
        },
        [
          {
            identifier: 'runtime-1',
            queueV2Item,
          },
          {
            identifier: 'runtime-2',
            queueV2Item,
          },
        ]
      )
    ).toBe('runtime-2');
  });
});
