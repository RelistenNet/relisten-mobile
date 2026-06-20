import { describe, expect, it } from 'vitest';
import {
  buildQueueV2CastCustomDataPayloads,
  buildQueueV2CastMediaInfoData,
  buildQueueV2CastQueueItemData,
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
});
