import { QueueV2Item } from '@/relisten/player/queue_v2';

export interface QueueV2CastCustomDataInput {
  runtimeIdentifier: string;
  sourceTrackUuid: string;
  queueV2Item: QueueV2Item;
}

export function buildQueueV2CastQueueItemData(input: QueueV2CastCustomDataInput) {
  const base = {
    identifier: input.runtimeIdentifier,
    queueV2Kind: input.queueV2Item.kind,
    queueV2ItemId: input.queueV2Item.queueItemId,
    sourceTrackUuid: input.sourceTrackUuid,
  };

  if (input.queueV2Item.kind === 'playlist') {
    return {
      ...base,
      playlistUuid: input.queueV2Item.playlistUuid,
      playlistEntryUuid: input.queueV2Item.playlistEntryUuid,
      blockUuid: input.queueV2Item.blockUuid,
      blockPosition: input.queueV2Item.blockPosition,
    };
  }

  return base;
}

export function buildQueueV2CastMediaInfoData(input: QueueV2CastCustomDataInput) {
  return {
    identifier: input.runtimeIdentifier,
    sourceTrackUuid: input.sourceTrackUuid,
  };
}

export function buildQueueV2CastCustomDataPayloads(input: QueueV2CastCustomDataInput) {
  return {
    queueItemCustomData: buildQueueV2CastQueueItemData(input),
    mediaInfoCustomData: buildQueueV2CastMediaInfoData(input),
  };
}
