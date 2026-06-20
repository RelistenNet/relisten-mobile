import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';

const CARPLAY_QUEUE_V2_ID_PREFIX = 'queue-v2';

export interface CarPlayQueueV2Identity {
  carPlayItemId: string;
  runtimeIdentifier: string;
  kind: string;
  queueItemId: string;
  sourceTrackUuid: string;
  playlistUuid?: string;
  playlistEntryUuid?: string;
  blockUuid?: string;
  blockPosition?: number;
}

export function carPlayQueueV2IdentityForTrack(track: PlayerQueueTrack): CarPlayQueueV2Identity {
  const item = track.queueV2Item;

  return {
    carPlayItemId: carPlayQueueItemIdForTrack(track),
    runtimeIdentifier: track.identifier,
    kind: item.kind,
    queueItemId: item.queueItemId,
    sourceTrackUuid: item.sourceTrackUuid,
    playlistUuid: item.kind === 'playlist' ? item.playlistUuid : undefined,
    playlistEntryUuid: item.kind === 'playlist' ? item.playlistEntryUuid : undefined,
    blockUuid: item.kind === 'playlist' ? (item.blockUuid ?? undefined) : undefined,
    blockPosition: item.kind === 'playlist' ? (item.blockPosition ?? undefined) : undefined,
  };
}

export function findCarPlayQueueTrackIndex(
  orderedTracks: PlayerQueueTrack[],
  carPlayItemId: string
) {
  // Prefer Queue V2-aware ids for duplicate source tracks, but fall back to the
  // old runtime identifier so existing CarPlay callbacks keep working.
  const queueV2Index = orderedTracks.findIndex(
    (track) => carPlayQueueItemIdForTrack(track) === carPlayItemId
  );

  if (queueV2Index >= 0) {
    return queueV2Index;
  }

  return orderedTracks.findIndex((track) => track.identifier === carPlayItemId);
}

function carPlayQueueItemIdForTrack(track: PlayerQueueTrack) {
  return [
    CARPLAY_QUEUE_V2_ID_PREFIX,
    encodeURIComponent(track.queueV2Item.queueItemId),
    encodeURIComponent(track.identifier),
  ].join(':');
}
