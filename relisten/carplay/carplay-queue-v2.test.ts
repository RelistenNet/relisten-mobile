import { describe, expect, it } from 'vitest';
import {
  carPlayQueueV2IdentityForTrack,
  findCarPlayQueueTrackIndex,
} from '@/relisten/carplay/queue_v2_identity';
import {
  createCatalogQueueV2Item,
  createPlaylistQueueV2Item,
  QueueV2Item,
} from '@/relisten/player/queue_v2';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';

describe('CarPlay Queue V2 identity', () => {
  it('builds distinct CarPlay row identifiers for duplicate playlist source tracks', () => {
    const first = queueTrack(
      'runtime-1',
      createPlaylistQueueV2Item({
        playlistUuid: 'playlist-1',
        playlistEntryUuid: 'entry-1',
        sourceTrackUuid: 'track-a',
        blockUuid: 'block-1',
        blockPosition: 0,
      })
    );
    const second = queueTrack(
      'runtime-2',
      createPlaylistQueueV2Item({
        playlistUuid: 'playlist-1',
        playlistEntryUuid: 'entry-2',
        sourceTrackUuid: 'track-a',
        blockUuid: 'block-1',
        blockPosition: 1,
      })
    );

    expect(carPlayQueueV2IdentityForTrack(first)).toEqual({
      carPlayItemId: 'queue-v2:playlist%3Aplaylist-1%3Aentry%3Aentry-1:runtime-1',
      runtimeIdentifier: 'runtime-1',
      kind: 'playlist',
      queueItemId: 'playlist:playlist-1:entry:entry-1',
      sourceTrackUuid: 'track-a',
      playlistUuid: 'playlist-1',
      playlistEntryUuid: 'entry-1',
      blockUuid: 'block-1',
      blockPosition: 0,
    });
    expect(carPlayQueueV2IdentityForTrack(first).carPlayItemId).not.toBe(
      carPlayQueueV2IdentityForTrack(second).carPlayItemId
    );
    expect(
      findCarPlayQueueTrackIndex(
        [first, second],
        carPlayQueueV2IdentityForTrack(second).carPlayItemId
      )
    ).toBe(1);
  });

  it('keeps CarPlay rows unique when runtime tracks share a Queue V2 item', () => {
    const sharedItem = createCatalogQueueV2Item('track-a');
    const first = queueTrack('runtime-1', sharedItem);
    const second = queueTrack('runtime-2', sharedItem);

    expect(carPlayQueueV2IdentityForTrack(first).carPlayItemId).not.toBe(
      carPlayQueueV2IdentityForTrack(second).carPlayItemId
    );
    expect(
      findCarPlayQueueTrackIndex(
        [first, second],
        carPlayQueueV2IdentityForTrack(second).carPlayItemId
      )
    ).toBe(1);
    expect(findCarPlayQueueTrackIndex([first, second], 'runtime-2')).toBe(1);
  });
});

function queueTrack(identifier: string, queueV2Item: QueueV2Item): PlayerQueueTrack {
  return {
    identifier,
    queueV2Item,
  } as PlayerQueueTrack;
}
