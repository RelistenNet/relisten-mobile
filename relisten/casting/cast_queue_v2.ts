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

export interface QueueV2CastStatusItemLike {
  customData?: unknown;
  mediaInfo?: {
    customData?: unknown;
  };
}

export interface QueueV2CastLocalTrackLike {
  identifier: string;
  queueV2Item: QueueV2Item;
}

export function castStatusRuntimeIdentifierForLocalQueue(
  item: QueueV2CastStatusItemLike | undefined,
  localTracks: QueueV2CastLocalTrackLike[]
): string | undefined {
  const legacyIdentifier = legacyRuntimeIdentifierFromCastStatusItem(item);

  // Runtime identifier is the most precise match when Cast echoes it back. If
  // that is missing/stale, Queue V2 item id can still disambiguate duplicate
  // source tracks in the local queue.
  if (legacyIdentifier && localTracks.some((track) => track.identifier === legacyIdentifier)) {
    return legacyIdentifier;
  }

  const queueV2ItemId = queueV2ItemIdFromCastStatusItem(item);

  if (queueV2ItemId) {
    const track = localTracks.find(
      (candidate) => candidate.queueV2Item.queueItemId === queueV2ItemId
    );

    if (track) {
      return track.identifier;
    }
  }

  return legacyIdentifier;
}

export function queueV2ItemIdFromCastStatusItem(
  item: QueueV2CastStatusItemLike | undefined
): string | undefined {
  const value = (item?.customData as { queueV2ItemId?: unknown } | undefined)?.queueV2ItemId;

  return typeof value === 'string' && value.trim() ? value : undefined;
}

function legacyRuntimeIdentifierFromCastStatusItem(
  item: QueueV2CastStatusItemLike | undefined
): string | undefined {
  const value = (item?.mediaInfo?.customData as { identifier?: unknown } | undefined)?.identifier;

  return typeof value === 'string' && value.trim() ? value : undefined;
}
