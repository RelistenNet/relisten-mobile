export const QUEUE_V2_STATE_VERSION = 2;

export type QueueV2ItemKind = 'catalog' | 'playlist';

export interface QueueV2BaseItem {
  kind: QueueV2ItemKind;
  queueItemId: string;
  sourceTrackUuid: string;
}

export interface QueueV2CatalogItem extends QueueV2BaseItem {
  kind: 'catalog';
}

export interface QueueV2PlaylistItem extends QueueV2BaseItem {
  kind: 'playlist';
  playlistUuid: string;
  playlistEntryUuid: string;
  blockUuid: string | null;
  blockPosition: number | null;
  title?: string;
}

export type QueueV2Item = QueueV2CatalogItem | QueueV2PlaylistItem;

export interface QueueV2HistoryAttribution {
  sourceTrackUuid: string;
  playlistUuid?: string;
  playlistEntryUuid?: string;
}

export interface QueueV2ShuffleUnit {
  key: string;
  items: QueueV2Item[];
}

export interface LegacyCatalogQueueState {
  queueSourceTrackUuids: string[];
  queueSourceTrackShuffledUuids: string[];
  activeSourceTrackIndex?: number | null;
  activeSourceTrackShuffledIndex?: number | null;
  activeQueueOrder?: 'original' | 'shuffled';
}

export interface QueueV2PersistedState {
  schemaVersion: typeof QUEUE_V2_STATE_VERSION;
  items: QueueV2Item[];
  shuffledQueueItemIds: string[];
  currentItemKey?: string;
}

export interface QueueV2RestorePlan<TQueueTrack> {
  orderedTracks: TQueueTrack[];
  shuffledTracks: TQueueTrack[];
  currentTrack?: TQueueTrack;
  usedQueueV2State: boolean;
}

export function createCatalogQueueV2Item(
  sourceTrackUuid: string,
  occurrenceIndex: number = 0
): QueueV2CatalogItem {
  assertNonEmpty(sourceTrackUuid, 'sourceTrackUuid');

  if (occurrenceIndex < 0 || !Number.isInteger(occurrenceIndex)) {
    throw new Error('occurrenceIndex must be a non-negative integer');
  }

  return {
    kind: 'catalog',
    queueItemId: `catalog:${encodeQueueV2IdPart(sourceTrackUuid)}:${occurrenceIndex}`,
    sourceTrackUuid,
  };
}

export function createCatalogQueueV2Items(sourceTrackUuids: string[]): QueueV2CatalogItem[] {
  const occurrenceCounts = new Map<string, number>();

  return sourceTrackUuids.map((sourceTrackUuid) => {
    const occurrenceIndex = occurrenceCounts.get(sourceTrackUuid) ?? 0;
    occurrenceCounts.set(sourceTrackUuid, occurrenceIndex + 1);

    return createCatalogQueueV2Item(sourceTrackUuid, occurrenceIndex);
  });
}

export function createPlaylistQueueV2Item(input: {
  playlistUuid: string;
  playlistEntryUuid: string;
  sourceTrackUuid: string;
  blockUuid?: string | null;
  blockPosition?: number | null;
  title?: string;
}): QueueV2PlaylistItem {
  assertNonEmpty(input.playlistUuid, 'playlistUuid');
  assertNonEmpty(input.playlistEntryUuid, 'playlistEntryUuid');
  assertNonEmpty(input.sourceTrackUuid, 'sourceTrackUuid');

  return {
    kind: 'playlist',
    queueItemId: playlistQueueItemId(input.playlistUuid, input.playlistEntryUuid),
    playlistUuid: input.playlistUuid,
    playlistEntryUuid: input.playlistEntryUuid,
    sourceTrackUuid: input.sourceTrackUuid,
    blockUuid: input.blockUuid ?? null,
    blockPosition: input.blockPosition ?? null,
    title: input.title,
  };
}

export function queueV2PlaybackCursor(item: QueueV2Item): string {
  return item.kind === 'playlist' ? item.playlistEntryUuid : item.queueItemId;
}

export function queueV2HistoryAttribution(item: QueueV2Item): QueueV2HistoryAttribution {
  if (item.kind === 'playlist') {
    return {
      sourceTrackUuid: item.sourceTrackUuid,
      playlistUuid: item.playlistUuid,
      playlistEntryUuid: item.playlistEntryUuid,
    };
  }

  return { sourceTrackUuid: item.sourceTrackUuid };
}

export function queueV2ShuffleUnits(items: QueueV2Item[]): QueueV2ShuffleUnit[] {
  const units: QueueV2ShuffleUnit[] = [];
  const blockUnitByKey = new Map<string, QueueV2ShuffleUnit>();

  for (const item of items) {
    const blockKey = queueV2BlockShuffleUnitKey(item);

    if (!blockKey) {
      units.push({
        key: standaloneShuffleUnitKey(item),
        items: [item],
      });
      continue;
    }

    const existingUnit = blockUnitByKey.get(blockKey);

    if (existingUnit) {
      existingUnit.items.push(item);
    } else {
      const unit = { key: blockKey, items: [item] };
      blockUnitByKey.set(blockKey, unit);
      units.push(unit);
    }
  }

  return units.map(sortShuffleUnitItems);
}

export function flattenQueueV2ShuffleUnits(units: QueueV2ShuffleUnit[]): QueueV2Item[] {
  return units.flatMap((unit) => unit.items);
}

export function migrateLegacyCatalogQueueStateToQueueV2(
  legacyState: LegacyCatalogQueueState
): QueueV2PersistedState {
  const queueItems = createCatalogQueueV2Items(legacyState.queueSourceTrackUuids);
  const queueItemsBySourceTrackUuid = queueItems.reduce<Map<string, QueueV2CatalogItem[]>>(
    (map, item) => {
      const items = map.get(item.sourceTrackUuid);

      if (items) {
        items.push(item);
      } else {
        map.set(item.sourceTrackUuid, [item]);
      }

      return map;
    },
    new Map()
  );
  const shuffledQueueItemIds = legacyState.queueSourceTrackShuffledUuids
    .map(
      (sourceTrackUuid) => queueItemsBySourceTrackUuid.get(sourceTrackUuid)?.shift()?.queueItemId
    )
    .filter((queueItemId): queueItemId is string => !!queueItemId);
  const currentItemKey =
    legacyState.activeQueueOrder === 'shuffled'
      ? shuffledQueueItemIds[legacyState.activeSourceTrackShuffledIndex ?? -1]
      : itemIdAt(queueItems, legacyState.activeSourceTrackIndex);

  return {
    schemaVersion: QUEUE_V2_STATE_VERSION,
    items: queueItems,
    shuffledQueueItemIds,
    currentItemKey,
  };
}

export function normalizeQueueV2ItemsForPersistence<TQueueTrack>(
  queueTracks: TQueueTrack[],
  sourceTrackUuidForTrack: (track: TQueueTrack) => string,
  queueV2ItemForTrack: (track: TQueueTrack) => QueueV2Item
): QueueV2Item[] {
  const catalogOccurrenceCounts = new Map<string, number>();

  return queueTracks.map((track) => {
    const queueV2Item = queueV2ItemForTrack(track);

    if (queueV2Item.kind === 'playlist') {
      return queueV2Item;
    }

    const sourceTrackUuid = sourceTrackUuidForTrack(track);
    const occurrenceIndex = catalogOccurrenceCounts.get(sourceTrackUuid) ?? 0;
    catalogOccurrenceCounts.set(sourceTrackUuid, occurrenceIndex + 1);

    return createCatalogQueueV2Item(sourceTrackUuid, occurrenceIndex);
  });
}

export function resolveQueueV2RestorePlan<TQueueTrack>(
  state: {
    queueV2Items?: QueueV2Item[];
    queueV2ShuffledQueueItemIds?: string[];
    queueV2CurrentItemKey?: string | null;
    legacySourceTrackUuids: string[];
    legacyShuffledSourceTrackUuids: string[];
    legacyCurrentIndex?: number | null;
    legacyShuffledCurrentIndex?: number | null;
    useShuffledOrder: boolean;
  },
  makeTrack: (sourceTrackUuid: string, queueItem?: QueueV2Item) => TQueueTrack | undefined
): QueueV2RestorePlan<TQueueTrack> {
  if (state.queueV2Items?.length) {
    const trackByItemId = new Map<string, TQueueTrack>();
    const orderedTracks = state.queueV2Items
      .map((item) => {
        const track = makeTrack(item.sourceTrackUuid, item);

        if (track) {
          trackByItemId.set(item.queueItemId, track);
        }

        return track;
      })
      .filter((track): track is TQueueTrack => !!track);
    const shuffledTracks =
      state.queueV2ShuffledQueueItemIds
        ?.map((queueItemId) => trackByItemId.get(queueItemId))
        .filter((track): track is TQueueTrack => !!track) ?? [];

    return {
      orderedTracks,
      shuffledTracks: shuffledTracks.length > 0 ? shuffledTracks : orderedTracks,
      currentTrack: state.queueV2CurrentItemKey
        ? trackByItemId.get(state.queueV2CurrentItemKey)
        : undefined,
      usedQueueV2State: true,
    };
  }

  const legacyQueueV2State = migrateLegacyCatalogQueueStateToQueueV2({
    queueSourceTrackUuids: state.legacySourceTrackUuids,
    queueSourceTrackShuffledUuids: state.legacyShuffledSourceTrackUuids,
    activeSourceTrackIndex: state.legacyCurrentIndex,
    activeSourceTrackShuffledIndex: state.legacyShuffledCurrentIndex,
    activeQueueOrder: state.useShuffledOrder ? 'shuffled' : 'original',
  });
  const trackByItemId = new Map<string, TQueueTrack>();
  const orderedTracks = legacyQueueV2State.items
    .map((item) => {
      const track = makeTrack(item.sourceTrackUuid, item);

      if (track) {
        trackByItemId.set(item.queueItemId, track);
      }

      return track;
    })
    .filter((track): track is TQueueTrack => !!track);
  const shuffledTracks = legacyQueueV2State.shuffledQueueItemIds
    .map((queueItemId) => trackByItemId.get(queueItemId))
    .filter((track): track is TQueueTrack => !!track);
  const currentTrackFromMigratedLegacyState = legacyQueueV2State.currentItemKey
    ? trackByItemId.get(legacyQueueV2State.currentItemKey)
    : undefined;

  return {
    orderedTracks,
    shuffledTracks: shuffledTracks.length > 0 ? shuffledTracks : orderedTracks,
    currentTrack:
      currentTrackFromMigratedLegacyState ??
      legacyFallbackCurrentTrack(
        orderedTracks,
        shuffledTracks,
        state.legacyCurrentIndex,
        state.legacyShuffledCurrentIndex,
        state.useShuffledOrder
      ),
    usedQueueV2State: false,
  };
}

function playlistQueueItemId(playlistUuid: string, playlistEntryUuid: string): string {
  return `playlist:${encodeQueueV2IdPart(playlistUuid)}:entry:${encodeQueueV2IdPart(
    playlistEntryUuid
  )}`;
}

function queueV2BlockShuffleUnitKey(item: QueueV2Item): string | undefined {
  if (item.kind !== 'playlist' || !item.blockUuid) {
    return undefined;
  }

  return `playlist:${encodeQueueV2IdPart(item.playlistUuid)}:block:${encodeQueueV2IdPart(
    item.blockUuid
  )}`;
}

function standaloneShuffleUnitKey(item: QueueV2Item): string {
  return `item:${item.queueItemId}`;
}

function sortShuffleUnitItems(unit: QueueV2ShuffleUnit): QueueV2ShuffleUnit {
  if (unit.items.length <= 1) {
    return unit;
  }

  return {
    ...unit,
    items: [...unit.items].sort(compareQueueV2BlockItems),
  };
}

function compareQueueV2BlockItems(a: QueueV2Item, b: QueueV2Item): number {
  if (a.kind !== 'playlist' || b.kind !== 'playlist') {
    return 0;
  }

  return compareNullableNumber(a.blockPosition, b.blockPosition);
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a == null && b == null) {
    return 0;
  }

  if (a == null) {
    return 1;
  }

  if (b == null) {
    return -1;
  }

  return a - b;
}

function itemIdAt(items: QueueV2Item[], maybeIndex: number | null | undefined): string | undefined {
  if (maybeIndex == null || maybeIndex < 0 || maybeIndex >= items.length) {
    return undefined;
  }

  return items[maybeIndex]?.queueItemId;
}

function legacyFallbackCurrentTrack<TQueueTrack>(
  orderedTracks: TQueueTrack[],
  shuffledTracks: TQueueTrack[],
  legacyCurrentIndex: number | null | undefined,
  legacyShuffledCurrentIndex: number | null | undefined,
  useShuffledOrder: boolean
): TQueueTrack | undefined {
  const preferredCurrentTrack = useShuffledOrder
    ? itemAt(shuffledTracks, legacyShuffledCurrentIndex)
    : itemAt(orderedTracks, legacyCurrentIndex);
  const fallbackCurrentTrack = useShuffledOrder
    ? itemAt(orderedTracks, legacyCurrentIndex)
    : itemAt(shuffledTracks, legacyShuffledCurrentIndex);

  return preferredCurrentTrack ?? fallbackCurrentTrack ?? orderedTracks[0];
}

function itemAt<T>(items: T[], maybeIndex: number | null | undefined): T | undefined {
  if (maybeIndex == null || maybeIndex < 0 || maybeIndex >= items.length) {
    return undefined;
  }

  return items[maybeIndex];
}

function encodeQueueV2IdPart(part: string): string {
  return encodeURIComponent(part);
}

function assertNonEmpty(value: string, name: string) {
  if (!value.trim()) {
    throw new Error(`${name} cannot be empty`);
  }
}
