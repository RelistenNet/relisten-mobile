import Realm from 'realm';

export const PLAYER_STATE_SENTINEL = 'player_state';

export interface PlayerStateProps {
  queueShuffleState: number;
  queueRepeatState: number;
  queueSourceTrackUuids: string[];
  queueSourceTrackShuffledUuids: string[];
  queueV2SchemaVersion?: number;
  queueV2ItemsJson?: string;
  queueV2ShuffledQueueItemIds?: string[];
  queueV2CurrentItemKey?: string;
  activeSourceTrackIndex?: number;
  activeSourceTrackShuffledIndex?: number;
  lastUpdatedAt: Date;
  duration?: number;
  progress?: number;
  elapsed?: number;
}

export class PlayerState extends Realm.Object<PlayerState> implements PlayerStateProps {
  static schema: Realm.ObjectSchema = {
    name: 'PlayerState',
    primaryKey: 'id',
    properties: {
      id: 'string',
      queueShuffleState: 'int',
      queueRepeatState: 'int',
      queueSourceTrackUuids: 'string[]',
      queueSourceTrackShuffledUuids: 'string[]',
      queueV2SchemaVersion: 'int?',
      queueV2ItemsJson: 'string?',
      queueV2ShuffledQueueItemIds: 'string[]',
      queueV2CurrentItemKey: 'string?',
      activeSourceTrackIndex: 'int?',
      activeSourceTrackShuffledIndex: 'int?',
      lastUpdatedAt: 'date',
      progress: 'float?',
      duration: 'float?',
      elapsed: 'float?',
    },
  };

  id!: string;
  queueShuffleState!: number;
  queueRepeatState!: number;
  queueSourceTrackUuids!: string[];
  queueSourceTrackShuffledUuids!: string[];
  queueV2SchemaVersion?: number;
  queueV2ItemsJson?: string;
  queueV2ShuffledQueueItemIds!: string[];
  queueV2CurrentItemKey?: string;
  activeSourceTrackIndex?: number;
  activeSourceTrackShuffledIndex?: number;
  lastUpdatedAt!: Date;
  progress?: number;
  duration?: number;
  elapsed?: number;

  static defaultObject(realm: Realm) {
    return realm.objectForPrimaryKey(PlayerState, PLAYER_STATE_SENTINEL);
  }

  static upsert(realm: Realm, props: PlayerStateProps): PlayerState {
    const obj = this.defaultObject(realm);

    return realm.write(() => {
      if (obj) {
        obj.queueShuffleState = props.queueShuffleState;
        obj.queueRepeatState = props.queueRepeatState;
        obj.queueSourceTrackUuids = props.queueSourceTrackUuids;
        obj.queueSourceTrackShuffledUuids = props.queueSourceTrackShuffledUuids;
        obj.queueV2SchemaVersion = props.queueV2SchemaVersion;
        obj.queueV2ItemsJson = props.queueV2ItemsJson;
        obj.queueV2ShuffledQueueItemIds = props.queueV2ShuffledQueueItemIds ?? [];
        obj.queueV2CurrentItemKey = props.queueV2CurrentItemKey;
        obj.activeSourceTrackIndex = props.activeSourceTrackIndex;
        obj.activeSourceTrackShuffledIndex = props.activeSourceTrackShuffledIndex;
        obj.lastUpdatedAt = props.lastUpdatedAt;
        obj.duration = props.duration;
        obj.progress = props.progress;
        obj.elapsed = props.elapsed;
        return obj;
      } else {
        return realm.create(PlayerState, {
          id: PLAYER_STATE_SENTINEL,
          ...props,
          queueV2ShuffledQueueItemIds: props.queueV2ShuffledQueueItemIds ?? [],
        });
      }
    });
  }

  static clear(realm: Realm) {
    const obj = this.defaultObject(realm);

    if (!obj) {
      return;
    }

    realm.write(() => {
      realm.delete(obj);
    });
  }

  debugState() {
    return `
RelistenPlayerState
  queueShuffleState=${this.queueShuffleState}
  queueRepeatState=${this.queueRepeatState}
  queueSourceTrackUuids=${this.queueSourceTrackUuids.length}
  queueSourceTrackShuffledUuids=${this.queueSourceTrackShuffledUuids.length}
  queueV2SchemaVersion=${this.queueV2SchemaVersion}
  queueV2ItemsJson=${this.queueV2ItemsJson?.length ?? 0}
  queueV2ShuffledQueueItemIds=${this.queueV2ShuffledQueueItemIds.length}
  queueV2CurrentItemKey=${this.queueV2CurrentItemKey}
  activeSourceTrackIndex=${this.activeSourceTrackIndex}
  activeSourceTrackShuffledIndex=${this.activeSourceTrackShuffledIndex}
  lastUpdatedAt=${this.lastUpdatedAt}
  progress=${this.progress}
  duration=${this.duration}
  elapsed=${this.elapsed}
    `.trim();
  }
}
