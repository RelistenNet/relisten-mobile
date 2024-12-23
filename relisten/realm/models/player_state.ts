import Realm from 'realm';

export const PLAYER_STATE_SENTINEL = 'player_state';

export interface PlayerStateProps {
  queueShuffleState: number;
  queueRepeatState: number;
  queueSourceTrackUuids: string[];
  queueSourceTrackShuffledUuids: string[];
  activeSourceTrackIndex?: number;
  activeSourceTrackShuffledIndex?: number;
  lastUpdatedAt: Date;
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
      activeSourceTrackIndex: 'int?',
      activeSourceTrackShuffledIndex: 'int?',
      lastUpdatedAt: 'date',
      progress: 'float?',
    },
  };

  id!: string;
  queueShuffleState!: number;
  queueRepeatState!: number;
  queueSourceTrackUuids!: string[];
  queueSourceTrackShuffledUuids!: string[];
  activeSourceTrackIndex?: number;
  activeSourceTrackShuffledIndex?: number;
  lastUpdatedAt!: Date;
  progress?: number;

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
        obj.activeSourceTrackIndex = props.activeSourceTrackIndex;
        obj.activeSourceTrackShuffledIndex = props.activeSourceTrackShuffledIndex;
        obj.lastUpdatedAt = props.lastUpdatedAt;
        return obj;
      } else {
        return realm.create(PlayerState, { id: PLAYER_STATE_SENTINEL, ...props });
      }
    });
  }

  debugState() {
    return `
RelistenPlayerState
  queueShuffleState=${this.queueShuffleState}
  queueRepeatState=${this.queueRepeatState}
  queueSourceTrackUuids=${this.queueSourceTrackUuids.length}
  queueSourceTrackShuffledUuids=${this.queueSourceTrackShuffledUuids.length}
  activeSourceTrackIndex=${this.activeSourceTrackIndex}
  activeSourceTrackShuffledIndex=${this.activeSourceTrackShuffledIndex}
  lastUpdatedAt=${this.lastUpdatedAt}
  progress=${this.progress}
    `.trim();
  }
}
