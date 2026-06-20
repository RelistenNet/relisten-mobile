import { RelistenStreamable } from '@/modules/relisten-audio-player';
import { nativePlayer } from '@/modules/relisten-audio-player';
import { addPlayerListeners } from '@/relisten/player/native_playback_state_hooks';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import {
  currentTrackIdentifier,
  progress as sharedStateProgress,
} from '@/relisten/player/shared_state';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { EventSource } from '@/relisten/util/event_source';
import { realm } from '@/relisten/realm/schema';
import { PlayerState } from '@/relisten/realm/models/player_state';
import { log } from '@/relisten/util/logging';
import { groupByUuid } from '@/relisten/util/group_by';
import { Realm } from '@realm/react';
import { indentString } from '@/relisten/util/string_indent';
import {
  createCatalogQueueV2Item,
  createCatalogQueueV2Items,
  normalizeQueueV2ItemsForPersistence,
  QUEUE_V2_STATE_VERSION,
  QueueV2Item,
  resolveQueueV2RestorePlan,
} from '@/relisten/player/queue_v2';

const logger = log.extend('player-queue');

export enum PlayerShuffleState {
  SHUFFLE_OFF = 1,
  SHUFFLE_ON,
}

export enum PlayerRepeatState {
  REPEAT_OFF = 1,
  REPEAT_TRACK,
  REPEAT_QUEUE,
}

function shuffleArray<T>(arr: T[]) {
  // ye old fisher-yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    // swap
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

let queueTrackId = 0;
// This caps the max tracks in queue at 100B
const MAX_QUEUE_TRACK_ID = 100_000_000_000;

function nextQueueTrackId() {
  queueTrackId++;

  if (queueTrackId >= MAX_QUEUE_TRACK_ID) {
    queueTrackId = 0;
  }

  return 'relistenQueueId_' + queueTrackId.toFixed(0);
}

export class PlayerQueueTrack {
  public readonly identifier: string;

  constructor(
    public readonly sourceTrack: SourceTrack,
    public readonly title: string,
    public readonly artist: string,
    public readonly subtitle: string,
    public readonly albumTitle: string,
    public readonly albumArt: string,
    public readonly queueV2Item: QueueV2Item = createCatalogQueueV2Item(sourceTrack.uuid)
  ) {
    this.identifier = nextQueueTrackId();
  }

  static fromSourceTrack(sourceTrack: SourceTrack, queueV2Item?: QueueV2Item) {
    const artist = sourceTrack.artist;
    const source = sourceTrack.source;
    const venue = sourceTrack.show.venue;

    const [year, month, day] = source.displayDate.split('-');

    const albumArtUrl = `https://sonos.relisten.net/album-art/${artist?.slug}/years/${year}/${year}-${month}-${day}/${source.uuid}/550.png`;

    return new PlayerQueueTrack(
      sourceTrack,
      sourceTrack.title,
      [artist.name, source.displayDate, venue?.name].filter((part) => !!part).join(' • ') || '',
      [artist.name, source.displayDate, venue?.name, venue?.location]
        .filter((part) => !!part)
        .join(' • ') || '',
      [source.displayDate, venue?.name].filter((part) => !!part).join(' • ') || '',
      albumArtUrl,
      queueV2Item
    );
  }

  static fromSourceTracks(sourceTracks: SourceTrack[]) {
    const queueV2Items = createCatalogQueueV2Items(sourceTracks.map((track) => track.uuid));

    return sourceTracks.map((sourceTrack, index) =>
      PlayerQueueTrack.fromSourceTrack(sourceTrack, queueV2Items[index])
    );
  }

  cloneForQueueInsert() {
    return new PlayerQueueTrack(
      this.sourceTrack,
      this.title,
      this.artist,
      this.subtitle,
      this.albumTitle,
      this.albumArt,
      this.queueV2Item
    );
  }

  toStreamable(
    allowStreamingCache: boolean,
    options?: {
      forceStreaming?: boolean;
    }
  ): RelistenStreamable {
    let url = this.sourceTrack.streamingUrl();
    let downloadDestination: string | undefined = undefined;

    if (!options?.forceStreaming && this.sourceTrack.offlineInfo?.isPlayableOffline()) {
      url = this.sourceTrack.downloadedFileLocation();
    } else if (!options?.forceStreaming && allowStreamingCache) {
      downloadDestination = this.sourceTrack.downloadedFileLocation();
    }

    return {
      identifier: this.identifier,
      url,
      cacheKey: this.sourceTrack.uuid,
      title: this.title,
      artist: this.artist,
      albumTitle: this.albumTitle,
      albumArt: this.albumArt,
      downloadDestination,
    };
  }

  debugState() {
    return `identifier=${this.identifier}; title=${this.title}`.trim();
  }
}

export class RelistenPlayerQueue {
  constructor(public readonly player: RelistenPlayer) {}

  // region Private fields
  private _shuffleState = PlayerShuffleState.SHUFFLE_OFF;
  private _repeatState = PlayerRepeatState.REPEAT_OFF;

  private _nextTrack?: PlayerQueueTrack;
  private _nextTrackIndex?: number;

  private originalTracks: PlayerQueueTrack[] = [];
  private originalTracksCurrentIndex?: number;

  private shuffledTracks: PlayerQueueTrack[] = [];
  private shuffledTracksCurrentIndex?: number;
  // endregion

  // region Public API
  onOrderedTracksChanged = new EventSource<PlayerQueueTrack[]>();
  onCurrentTrackChanged = new EventSource<PlayerQueueTrack | undefined>();
  onRepeatStateChanged = new EventSource<PlayerRepeatState>();
  onShuffleStateChanged = new EventSource<PlayerShuffleState>();

  public currentTrackPlaybackStartedAt: Date | undefined = undefined;
  public prevNextTrackIndexIntentOffset = 0;

  queueNextTrack(queueTracks: PlayerQueueTrack[]) {
    const insertedQueueTracks = queueTracks.map((track) => track.cloneForQueueInsert());

    function insertNext(arr: PlayerQueueTrack[], currentIndex: number | undefined) {
      const targetIndex = currentIndex !== undefined ? currentIndex + 1 : 0;
      const arrCopy = [...arr];

      arrCopy.splice(targetIndex, 0, ...insertedQueueTracks);

      return arrCopy;
    }

    this.originalTracks = insertNext(this.originalTracks, this.originalTracksCurrentIndex);
    this.shuffledTracks = insertNext(this.shuffledTracks, this.shuffledTracksCurrentIndex);

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState();
  }

  addTrackToEndOfQueue(queueTracks: PlayerQueueTrack[]) {
    const insertedQueueTracks = queueTracks.map((track) => track.cloneForQueueInsert());

    this.originalTracks = [...this.originalTracks, ...insertedQueueTracks];
    this.shuffledTracks = [...this.shuffledTracks, ...insertedQueueTracks];

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState();
  }

  reorderQueue(newQueue: PlayerQueueTrack[]) {
    this.originalTracks = [...newQueue];
    this.reshuffleTracks();

    if (this.currentTrack !== undefined) {
      this.recalculateTrackIndexes(this.currentTrack.identifier);
    }

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState();
  }

  moveQueueTrack(from: number, to: number) {
    function reorderItems<T>(data: T[], from: number, to: number): T[] {
      const newData = [...data];
      newData.splice(to, 0, newData.splice(from, 1)[0]);
      return newData;
    }

    // if in a shuffled state,
    if (this.shuffleState == PlayerShuffleState.SHUFFLE_ON) {
      this.shuffledTracks = reorderItems(this.shuffledTracks, from, to);
    } else {
      this.originalTracks = reorderItems(this.originalTracks, from, to);
    }

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState();
  }

  replaceQueue(
    newQueue: PlayerQueueTrack[],
    playingTrackAtIndex: number | undefined,
    options?: { resetShuffle?: boolean }
  ) {
    this.player.cancelPendingPlayRequests('replaceQueue');
    this.originalTracks = [...newQueue];
    this.originalTracksCurrentIndex = undefined;

    this.shuffledTracksCurrentIndex = undefined;
    this.prevNextTrackIndexIntentOffset = 0;
    this.reshuffleTracks();

    if (options?.resetShuffle && this._shuffleState !== PlayerShuffleState.SHUFFLE_OFF) {
      this._shuffleState = PlayerShuffleState.SHUFFLE_OFF;
      this.onShuffleStateChanged.dispatch(this._shuffleState);
      nativePlayer.setShuffleMode(this._shuffleState);
    }

    if (playingTrackAtIndex !== undefined) {
      this.player.playTrackAtIndex(playingTrackAtIndex);
    } else {
      // recalculates next track
      this.onCurrentTrackIdentifierChanged(undefined);

      if (this.player.playbackIntentStarted) {
        this.player.stop();
      }
    }

    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState();
  }

  removeTrackAtIndex(index: number) {
    const originalCopy = [...this.originalTracks];
    const [removed] = originalCopy.splice(index, 1);

    this.originalTracks = originalCopy;

    const shuffledCopy = [...this.shuffledTracks];

    for (let i = 0; i < this.shuffledTracks.length; i++) {
      if (this.shuffledTracks[i].identifier === removed.identifier) {
        shuffledCopy.splice(i, 1);
        break;
      }
    }

    this.shuffledTracks = shuffledCopy;

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState();
  }

  get shuffleState() {
    return this._shuffleState;
  }

  get repeatState() {
    return this._repeatState;
  }

  get currentTrack() {
    const idx = this.currentIndex;

    if (idx === undefined) {
      return undefined;
    }

    return this.orderedTracks[idx];
  }

  get nextTrack() {
    return this._nextTrack;
  }

  get nextTrackIndex() {
    return this._nextTrackIndex;
  }

  get orderedTracks() {
    return this.shuffleState == PlayerShuffleState.SHUFFLE_ON
      ? this.shuffledTracks
      : this.originalTracks;
  }

  get currentIndex() {
    return this.shuffleState == PlayerShuffleState.SHUFFLE_ON
      ? this.shuffledTracksCurrentIndex
      : this.originalTracksCurrentIndex;
  }

  get isCurrentTrackFirst() {
    const idx = this.currentIndex;

    if (idx === undefined) {
      return true;
    }

    return idx === 0;
  }

  get isCurrentTrackLast() {
    const idx = this.currentIndex;

    if (idx === undefined) {
      return true;
    }

    return idx + 1 === this.orderedTracks.length;
  }

  setShuffleState(shuffleState: PlayerShuffleState) {
    if (this._shuffleState != shuffleState) {
      if (
        this._shuffleState == PlayerShuffleState.SHUFFLE_OFF &&
        shuffleState == PlayerShuffleState.SHUFFLE_ON
      ) {
        // If we turn on shuffling while something is playing (could be paused), we should reshuffle so that the
        // currently playing item is the first track in the queue after shuffling.
        this.reshuffleTracks();
      }
      // When disabling shuffle we don't need to do anything because the shuffled list won't be accessed.

      this._shuffleState = shuffleState;

      this.recalculateNextTrack();
      this.onShuffleStateChanged.dispatch(shuffleState);
      this.onOrderedTracksChanged.dispatch(this.orderedTracks);
      this.savePlayerState();
      nativePlayer.setShuffleMode(shuffleState);
    }
  }

  setRepeatState(repeatState: PlayerRepeatState) {
    if (this._repeatState != repeatState) {
      this._repeatState = repeatState;

      this.recalculateNextTrack();
      this.onRepeatStateChanged.dispatch(repeatState);
      this.savePlayerState();
      nativePlayer.setRepeatMode(repeatState);
    }
  }

  debugState(includingTracks: boolean = false) {
    let tracks = '';

    if (includingTracks) {
      tracks = `

PlayerQueueTracks; originalTracks (${this.originalTracks.length}):
${indentString(this.originalTracks.map((t) => t.debugState()).join('\n'))}      

PlayerQueueTracks; shuffledTracks (${this.shuffledTracks.length}):
${indentString(this.shuffledTracks.map((t) => t.debugState()).join('\n'))}      
`.trim();
    }

    return `
RelistenPlayerQueue:
  shuffleState=${this.shuffleState}
  repeatState=${this.repeatState}
  currentIndex=${this.currentIndex}
  currentTrack=${this.currentTrack?.debugState()}
  nextTrack=${this.currentTrack?.debugState()}
  
  originalTracksCurrentIndex=${this.originalTracksCurrentIndex}
  shuffledTracksCurrentIndex=${this.shuffledTracksCurrentIndex}
${indentString(tracks)}
`.trim();
  }

  // endregion

  // region Shuffling
  private reshuffleTracks() {
    if (this.originalTracksCurrentIndex !== undefined) {
      const originalTracksCopy = [...this.originalTracks];
      const [currentlyPlayingItem] = originalTracksCopy.splice(this.originalTracksCurrentIndex, 1);

      this.shuffledTracks = [currentlyPlayingItem].concat(shuffleArray(originalTracksCopy));
      this.shuffledTracksCurrentIndex = 0;
    } else {
      this.shuffledTracks = shuffleArray([...this.originalTracks]);
    }
  }

  // endregion

  // region Next track management
  public recalculateNextTrack() {
    const prevNextTrack = this._nextTrack;
    const newNextTrackIndex = this.calculateNextTrackIndex();
    const newNextTrack = this.calculateNextTrack();

    this._nextTrackIndex = newNextTrackIndex;
    this._nextTrack = newNextTrack;

    log.debug(
      `[recalculateNextTrack] ${newNextTrack?.identifier}, ${prevNextTrack?.identifier}, ${this.player.playbackIntentStarted}`
    );

    if (newNextTrack?.identifier !== prevNextTrack?.identifier) {
      if (newNextTrack) {
        this.player.setNextStream(newNextTrack.toStreamable(this.player.enableStreamingCache));
      } else {
        this.player.setNextStream(undefined);
      }
    }
  }

  private calculateNextTrackIndex(): number | undefined {
    if (this.currentIndex === undefined) {
      return undefined;
    }

    if (this.repeatState === PlayerRepeatState.REPEAT_TRACK) {
      return this.currentIndex;
    }

    const maybeNextIndex = this.currentIndex + 1;

    if (maybeNextIndex < this.orderedTracks.length) {
      return maybeNextIndex;
    }

    if (this.repeatState === PlayerRepeatState.REPEAT_QUEUE) {
      return 0;
    } else if (this.repeatState === PlayerRepeatState.REPEAT_OFF) {
      return undefined;
    }

    return undefined;
  }

  private calculateNextTrack(): PlayerQueueTrack | undefined {
    const nextTrackIndex = this.calculateNextTrackIndex();

    if (nextTrackIndex !== undefined) {
      return this.orderedTracks[nextTrackIndex];
    }

    return undefined;
  }

  // endregion

  // region Cleanup
  private clearCurrentTrack() {
    this.originalTracksCurrentIndex = undefined;
    this.shuffledTracksCurrentIndex = undefined;
  }

  // endregion

  // region Native player listeners
  private addedPlayerListeners = false;

  addPlayerListeners() {
    if (this.addedPlayerListeners) {
      return;
    }

    addPlayerListeners();
    currentTrackIdentifier.addListener(this.onCurrentTrackIdentifierChanged);

    this.addedPlayerListeners = true;
  }

  removePlayerListeners() {
    if (!this.addedPlayerListeners) {
      return;
    }

    currentTrackIdentifier.removeListener(this.onCurrentTrackIdentifierChanged);

    this.addedPlayerListeners = false;
  }

  public onCurrentTrackIdentifierChanged = (newIdentifier?: string) => {
    log.debug(`onCurrentTrackIdentifierChanged newIdentifier=${newIdentifier}`);

    if (!newIdentifier) {
      log.debug(`onCurrentTrackIdentifierChanged ignored because newIdentifier=${newIdentifier}`);

      // prevent the player bottom bar UI from disappearing. always show whatever was last playing
      return;
    }

    const match = this.originalTracks.find((t) => t.identifier === newIdentifier);

    if (match === undefined) {
      log.debug(
        `onCurrentTrackIdentifierChanged ignored because newIdentifier=${newIdentifier} not found in the list of identifiers`
      );

      // prevent the player bottom bar UI from disappearing. always show whatever was last playing
      return;
    }

    this.clearCurrentTrack();

    this.prevNextTrackIndexIntentOffset = 0;
    this.recalculateTrackIndexes(newIdentifier);
    this.currentTrackPlaybackStartedAt = new Date();

    this.recalculateNextTrack();
    this.onCurrentTrackChanged.dispatch(this.currentTrack);
    this.savePlayerState();
  };

  private recalculateTrackIndexes(newIdentifier: string) {
    for (let i = 0; i < this.originalTracks.length; i++) {
      const originalTrack = this.originalTracks[i];
      const shuffledTrack = this.shuffledTracks[i];

      if (originalTrack.identifier == newIdentifier) {
        this.originalTracksCurrentIndex = i;
      }

      if (shuffledTrack?.identifier == newIdentifier) {
        this.shuffledTracksCurrentIndex = i;
      }

      if (
        this.originalTracksCurrentIndex !== undefined &&
        this.shuffledTracksCurrentIndex !== undefined
      ) {
        break;
      }
    }
  }

  private restoreTrackIndexesBySourceTrackUuid(sourceTrackUuid: string) {
    this.clearCurrentTrack();

    // Queue item identifiers are regenerated on cold start, so restore has to re-anchor by
    // stable SourceTrack UUID and then recover both original/shuffled indexes from that identity.
    this.originalTracksCurrentIndex = this.originalTracks.findIndex(
      (track) => track.sourceTrack.uuid === sourceTrackUuid
    );
    this.shuffledTracksCurrentIndex = this.shuffledTracks.findIndex(
      (track) => track.sourceTrack.uuid === sourceTrackUuid
    );

    if (this.originalTracksCurrentIndex < 0) {
      this.originalTracksCurrentIndex = undefined;
    }

    if (this.shuffledTracksCurrentIndex < 0) {
      this.shuffledTracksCurrentIndex = undefined;
    }
  }
  // endregion

  // region Player state serialization
  private playerStateDebounce: number | undefined = undefined;

  public savePlayerState() {
    if (this.playerStateDebounce) {
      clearTimeout(this.playerStateDebounce);
    }

    this.playerStateDebounce = setTimeout(() => {
      if (realm) {
        const queueV2State = this.catalogQueueV2PersistedState();
        const state = {
          queueShuffleState: this.shuffleState,
          queueRepeatState: this.repeatState,
          queueSourceTrackUuids: this.originalTracks.map((t) => t.sourceTrack.uuid),
          queueSourceTrackShuffledUuids: this.shuffledTracks.map((t) => t.sourceTrack.uuid),
          queueV2SchemaVersion: queueV2State.schemaVersion,
          queueV2ItemsJson: JSON.stringify(queueV2State.items),
          queueV2ShuffledQueueItemIds: queueV2State.shuffledQueueItemIds,
          queueV2CurrentItemKey: queueV2State.currentItemKey,
          activeSourceTrackIndex: this.originalTracksCurrentIndex,
          activeSourceTrackShuffledIndex: this.shuffledTracksCurrentIndex,
          lastUpdatedAt: new Date(),
          progress: this.player.progress?.percent,
          duration: this.player.progress?.duration,
          elapsed: this.player.progress?.elapsed,
        };
        logger.debug('writing player state progress', {
          activeSourceTrackIndex: state.activeSourceTrackIndex,
          activeSourceTrackShuffledIndex: state.activeSourceTrackShuffledIndex,
          currentTrackUuid: this.currentTrack?.sourceTrack.uuid,
          duration: state.duration,
          elapsed: state.elapsed,
          progress: state.progress,
          queueV2CurrentItemKey: state.queueV2CurrentItemKey,
          shuffleState: state.queueShuffleState,
        });
        PlayerState.upsert(realm, state);
        logger.debug('wrote player state');
      } else {
        logger.warn('Not writing player state -- realm is not available.');
      }
    }, 1000) as unknown as number;
  }

  private catalogQueueV2PersistedState() {
    const items = normalizeQueueV2ItemsForPersistence(
      this.originalTracks,
      (track) => track.sourceTrack.uuid,
      (track) => track.queueV2Item
    );
    const itemIdsByOriginalIndex = items.map((item) => item.queueItemId);
    const shuffledQueueItemIds = this.queueV2ItemIdsForRuntimeOrder(
      this.shuffledTracks,
      itemIdsByOriginalIndex
    );

    return {
      schemaVersion: QUEUE_V2_STATE_VERSION,
      items,
      shuffledQueueItemIds,
      currentItemKey: this.currentQueueV2ItemKey(itemIdsByOriginalIndex, shuffledQueueItemIds),
    };
  }

  private queueV2ItemIdsForRuntimeOrder(
    tracks: PlayerQueueTrack[],
    itemIdsByOriginalIndex: string[]
  ) {
    const originalIndexesByRuntimeIdentifier = new Map<string, number[]>();

    this.originalTracks.forEach((track, index) => {
      const indexes = originalIndexesByRuntimeIdentifier.get(track.identifier);

      if (indexes) {
        indexes.push(index);
      } else {
        originalIndexesByRuntimeIdentifier.set(track.identifier, [index]);
      }
    });

    return tracks
      .map((track) => {
        const originalIndex = originalIndexesByRuntimeIdentifier.get(track.identifier)?.shift();
        return originalIndex === undefined ? undefined : itemIdsByOriginalIndex[originalIndex];
      })
      .filter((queueItemId): queueItemId is string => !!queueItemId);
  }

  private currentQueueV2ItemKey(itemIdsByOriginalIndex: string[], shuffledQueueItemIds: string[]) {
    if (
      this.shuffleState === PlayerShuffleState.SHUFFLE_ON &&
      this.shuffledTracksCurrentIndex !== undefined
    ) {
      return shuffledQueueItemIds[this.shuffledTracksCurrentIndex];
    }

    return this.originalTracksCurrentIndex === undefined
      ? undefined
      : itemIdsByOriginalIndex[this.originalTracksCurrentIndex];
  }

  public async restorePlayerState(realm: Realm) {
    const playerState = PlayerState.defaultObject(realm);

    if (!playerState) {
      logger.debug('No player state found to restore');
      return;
    }

    try {
      logger.debug('read player state for restore', {
        activeSourceTrackIndex: playerState.activeSourceTrackIndex,
        activeSourceTrackShuffledIndex: playerState.activeSourceTrackShuffledIndex,
        duration: playerState.duration,
        elapsed: playerState.elapsed,
        progress: playerState.progress,
        queueV2CurrentItemKey: playerState.queueV2CurrentItemKey,
        queueV2SchemaVersion: playerState.queueV2SchemaVersion,
        queueLength: playerState.queueSourceTrackUuids.length,
        queueShuffleState: playerState.queueShuffleState,
      });

      const queueV2Items = this.parsePersistedQueueV2Items(playerState);

      const sourceTrackUuidsToHydrate = [
        ...new Set([
          ...playerState.queueSourceTrackUuids,
          ...(queueV2Items?.map((item) => item.sourceTrackUuid) ?? []),
        ]),
      ];
      const sourceTracksByUuid = groupByUuid([
        ...realm.objects(SourceTrack).filtered('uuid in $0', sourceTrackUuidsToHydrate),
      ]);
      let droppedInvalidTrack = false;

      const makeQueueTrack = (sourceTrackUuid: string, queueV2Item?: QueueV2Item) => {
        const sourceTrack = sourceTracksByUuid[sourceTrackUuid];

        if (!sourceTrack) {
          droppedInvalidTrack = true;
          return;
        }

        try {
          return PlayerQueueTrack.fromSourceTrack(sourceTrack, queueV2Item);
        } catch (error) {
          droppedInvalidTrack = true;
          logger.warn('Skipping invalid persisted queue track during restore', {
            error,
            queueItemId: queueV2Item?.queueItemId,
            sourceTrackUuid,
          });
          return;
        }
      };

      this.setShuffleState(playerState.queueShuffleState);
      this.setRepeatState(playerState.queueRepeatState);

      const restorePlan = resolveQueueV2RestorePlan(
        {
          queueV2Items,
          queueV2ShuffledQueueItemIds: [...playerState.queueV2ShuffledQueueItemIds],
          queueV2CurrentItemKey: playerState.queueV2CurrentItemKey,
          legacySourceTrackUuids: [...playerState.queueSourceTrackUuids],
          legacyShuffledSourceTrackUuids: [...playerState.queueSourceTrackShuffledUuids],
          legacyCurrentIndex: playerState.activeSourceTrackIndex,
          legacyShuffledCurrentIndex: playerState.activeSourceTrackShuffledIndex,
          useShuffledOrder: this.shuffleState === PlayerShuffleState.SHUFFLE_ON,
        },
        makeQueueTrack
      );

      this.replaceQueue(restorePlan.orderedTracks, undefined);
      this.shuffledTracks = restorePlan.shuffledTracks;
      this.onOrderedTracksChanged.dispatch(this.orderedTracks);

      if (restorePlan.currentTrack) {
        this.clearCurrentTrack();
        this.recalculateTrackIndexes(restorePlan.currentTrack.identifier);
      }

      if (this.currentTrack) {
        this.onCurrentTrackChanged.dispatch(this.currentTrack);
      }

      logger.debug('resolved player state restore target', {
        currentTrackUuid: this.currentTrack?.sourceTrack.uuid,
        originalTracksCurrentIndex: this.originalTracksCurrentIndex,
        queueV2CurrentItemKey: playerState.queueV2CurrentItemKey,
        restoredQueueV2TrackIdentifier: restorePlan.usedQueueV2State
          ? restorePlan.currentTrack?.identifier
          : undefined,
        restoredTrackUuid: restorePlan.currentTrack?.sourceTrack.uuid,
        shuffledTracksCurrentIndex: this.shuffledTracksCurrentIndex,
        shuffleState: this.shuffleState,
      });

      this._nextTrack = undefined;
      this._nextTrackIndex = undefined;

      if (playerState.elapsed != null && playerState.duration != null) {
        const restoredProgress = {
          elapsed: playerState.elapsed,
          duration: playerState.duration,
          percent: playerState.duration > 0 ? playerState.elapsed / playerState.duration : 0,
        };

        logger.debug('restoring player progress', {
          currentTrackUuid: this.currentTrack?.sourceTrack.uuid,
          duration: restoredProgress.duration,
          elapsed: restoredProgress.elapsed,
          percent: restoredProgress.percent,
        });

        this.player.seekToTime(restoredProgress.elapsed).then(() => {});
        this.player.progress = restoredProgress;
        sharedStateProgress.setState(restoredProgress);
      } else {
        logger.debug('player state restore did not contain persisted progress', {
          currentTrackUuid: this.currentTrack?.sourceTrack.uuid,
          duration: playerState.duration,
          elapsed: playerState.elapsed,
          progress: playerState.progress,
        });
      }

      if (droppedInvalidTrack) {
        logger.warn(
          'Persisted player state referenced invalid queue tracks; rewriting sanitized state'
        );
      }

      this.savePlayerState();
    } catch (error) {
      logger.warn('Failed to restore persisted player state; clearing saved queue', error);
      PlayerState.clear(realm);
      this.replaceQueue([], undefined);
    }
  }

  private parsePersistedQueueV2Items(playerState: PlayerState): QueueV2Item[] | undefined {
    if (
      playerState.queueV2SchemaVersion !== QUEUE_V2_STATE_VERSION ||
      !playerState.queueV2ItemsJson
    ) {
      return undefined;
    }

    try {
      const parsedItems = JSON.parse(playerState.queueV2ItemsJson);

      if (!Array.isArray(parsedItems)) {
        logger.warn('Ignoring persisted Queue V2 state because items JSON is not an array');
        return undefined;
      }

      if (!parsedItems.every(isPersistedQueueV2Item)) {
        logger.warn('Ignoring persisted Queue V2 state because item JSON is invalid');
        return undefined;
      }

      return parsedItems as QueueV2Item[];
    } catch (error) {
      logger.warn('Ignoring invalid persisted Queue V2 state; falling back to legacy queue', error);
      return undefined;
    }
  }
  // endregion
}

function isPersistedQueueV2Item(item: unknown): item is QueueV2Item {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const maybeItem = item as Partial<QueueV2Item>;

  return (
    (maybeItem.kind === 'catalog' || maybeItem.kind === 'playlist') &&
    typeof maybeItem.queueItemId === 'string' &&
    typeof maybeItem.sourceTrackUuid === 'string'
  );
}
