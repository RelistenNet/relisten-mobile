import Realm from 'realm';
import { PlayerRepeatState } from '@/relisten/player/player_modes';

export const PLAYER_STATE_SENTINEL = 'player_state';

/** One occurrence in the original queue. Its ID survives reorder and restart. */
export interface PlayerQueueEntryProps {
  id: string;
  sourceTrackUuid: string;
}

export interface PlayerShuffleOrderProps {
  entryIds: string[];
}

/** Selection and timing describe the same queue occurrence. Timing is in seconds. */
export interface PlayerCheckpointProps {
  entryId: string;
  elapsedSeconds: number;
  /** Confirmed progress can use native or catalog duration. */
  durationSeconds?: number | null;
}

export interface PlayerStateProps {
  queueEntries: PlayerQueueEntryProps[];
  /** Null disables shuffle; an order contains each queue entry ID once. */
  shuffleOrder: PlayerShuffleOrderProps | null;
  repeatMode: PlayerRepeatState;
  checkpoint: PlayerCheckpointProps | null;
  lastUpdatedAt: Date;
}

export class PlayerQueueEntry
  extends Realm.Object<PlayerQueueEntry>
  implements PlayerQueueEntryProps
{
  static schema: Realm.ObjectSchema = {
    name: 'PlayerQueueEntry',
    embedded: true,
    properties: { id: 'string', sourceTrackUuid: 'string' },
  };

  id!: string;
  sourceTrackUuid!: string;
}

export class PlayerShuffleOrder extends Realm.Object<PlayerShuffleOrder> {
  static schema: Realm.ObjectSchema = {
    name: 'PlayerShuffleOrder',
    embedded: true,
    properties: { entryIds: 'string[]' },
  };

  entryIds!: Realm.List<string>;
}

export class PlayerCheckpoint
  extends Realm.Object<PlayerCheckpoint>
  implements PlayerCheckpointProps
{
  static schema: Realm.ObjectSchema = {
    name: 'PlayerCheckpoint',
    embedded: true,
    properties: {
      entryId: 'string',
      elapsedSeconds: 'double',
      durationSeconds: 'double?',
    },
  };

  entryId!: string;
  elapsedSeconds!: number;
  durationSeconds!: number | null;
}

interface PlayerStateUpdates {
  id: string;
  queueEntries?: PlayerQueueEntryProps[];
  shuffleOrder?: PlayerShuffleOrderProps | null;
  repeatMode: PlayerRepeatState;
  checkpoint?: PlayerCheckpointProps | null;
  lastUpdatedAt: Date;
}

/** Realm owns one queue and its latest confirmed playback checkpoint. */
export class PlayerState extends Realm.Object<PlayerState> {
  static schema: Realm.ObjectSchema = {
    name: 'PlayerState',
    primaryKey: 'id',
    properties: {
      id: 'string',
      queueEntries: 'PlayerQueueEntry[]',
      shuffleOrder: 'PlayerShuffleOrder?',
      repeatMode: 'int',
      checkpoint: 'PlayerCheckpoint?',
      lastUpdatedAt: 'date',
    },
  };

  id!: string;
  queueEntries!: Realm.List<PlayerQueueEntry>;
  shuffleOrder!: PlayerShuffleOrder | null;
  repeatMode!: PlayerRepeatState;
  checkpoint!: PlayerCheckpoint | null;
  lastUpdatedAt!: Date;

  static defaultObject(realm: Realm) {
    return realm.objectForPrimaryKey(PlayerState, PLAYER_STATE_SENTINEL);
  }

  /** Update the whole record atomically, retaining queue objects during progress-only writes. */
  static upsert(realm: Realm, props: PlayerStateProps): PlayerState {
    return realm.write(() => {
      const current = this.defaultObject(realm);
      if (!current) {
        // Realm accepts embedded DTOs, but Unmanaged<T> only remaps list properties.
        return realm.create(PlayerState, {
          id: PLAYER_STATE_SENTINEL,
          ...props,
        } as Realm.Unmanaged<PlayerState>);
      }

      const updates: PlayerStateUpdates = {
        id: PLAYER_STATE_SENTINEL,
        repeatMode: props.repeatMode,
        lastUpdatedAt: props.lastUpdatedAt,
      };
      if (
        current.queueEntries.length !== props.queueEntries.length ||
        current.queueEntries.some(
          (entry, index) =>
            entry.id !== props.queueEntries[index].id ||
            entry.sourceTrackUuid !== props.queueEntries[index].sourceTrackUuid
        )
      ) {
        updates.queueEntries = props.queueEntries;
      }
      const oldOrder = current.shuffleOrder?.entryIds;
      const newOrder = props.shuffleOrder?.entryIds;
      if (
        oldOrder?.length !== newOrder?.length ||
        oldOrder?.some((id, index) => id !== newOrder?.[index])
      ) {
        updates.shuffleOrder = props.shuffleOrder;
      }
      if (current.checkpoint && props.checkpoint) {
        current.checkpoint.entryId = props.checkpoint.entryId;
        current.checkpoint.elapsedSeconds = props.checkpoint.elapsedSeconds;
        current.checkpoint.durationSeconds = props.checkpoint.durationSeconds ?? null;
      } else {
        updates.checkpoint = props.checkpoint;
      }
      return realm.create(
        PlayerState,
        updates as Realm.Unmanaged<PlayerState>,
        Realm.UpdateMode.Modified
      );
    });
  }

  static clear(realm: Realm) {
    const current = this.defaultObject(realm);
    if (current) realm.write(() => realm.delete(current));
  }

  debugState() {
    return `
RelistenPlayerState
  queueEntries=${this.queueEntries.length}
  shuffled=${this.shuffleOrder !== null}
  repeatMode=${this.repeatMode}
  activeEntryId=${this.checkpoint?.entryId}
  lastUpdatedAt=${this.lastUpdatedAt}
  duration=${this.checkpoint?.durationSeconds}
  elapsed=${this.checkpoint?.elapsedSeconds}
    `.trim();
  }
}

export const PLAYER_STATE_SCHEMAS = [
  PlayerQueueEntry,
  PlayerShuffleOrder,
  PlayerCheckpoint,
  PlayerState,
];
