import { nativePlayer, RelistenStreamable } from '@/modules/relisten-audio-player';
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
    public readonly albumTitle: string,
    public readonly albumArt: string
  ) {
    this.identifier = nextQueueTrackId();
  }

  static fromSourceTrack(sourceTrack: SourceTrack) {
    const artist = sourceTrack.artist;
    const source = sourceTrack.source;
    const venue = sourceTrack.show.venue;

    const [year, month, day] = source.displayDate.split('-');

    const albumArtUrl = `https://sonos.relisten.net/album-art/${artist?.slug}/years/${year}/${year}-${month}-${day}/${source.uuid}/550.png`;

    return new PlayerQueueTrack(
      sourceTrack,
      sourceTrack.title,
      [artist.name, source.displayDate, venue?.name].filter((part) => !!part).join(' • ') || '',
      [source.displayDate, venue?.name].filter((part) => !!part).join(' • ') || '',
      albumArtUrl
    );
  }

  toStreamable(allowStreamingCache: boolean): RelistenStreamable {
    let url = this.sourceTrack.streamingUrl();
    let downloadDestination: string | undefined = undefined;

    if (this.sourceTrack.offlineInfo?.isPlayableOffline()) {
      url = this.sourceTrack.downloadedFileLocation();
    } else if (allowStreamingCache) {
      downloadDestination = this.sourceTrack.downloadedFileLocation();
    }

    return {
      identifier: this.identifier,
      url,
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
    function insertNext(arr: PlayerQueueTrack[], currentIndex: number | undefined) {
      const targetIndex = currentIndex !== undefined ? currentIndex + 1 : 0;
      const arrCopy = [...arr];

      arrCopy.splice(targetIndex, 0, ...queueTracks);

      return arrCopy;
    }

    this.originalTracks = insertNext(this.originalTracks, this.originalTracksCurrentIndex);
    this.shuffledTracks = insertNext(this.shuffledTracks, this.shuffledTracksCurrentIndex);

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState();
  }

  addTrackToEndOfQueue(queueTracks: PlayerQueueTrack[]) {
    this.originalTracks = [...this.originalTracks, ...queueTracks];
    this.shuffledTracks = [...this.shuffledTracks, ...queueTracks];

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

  replaceQueue(newQueue: PlayerQueueTrack[], playingTrackAtIndex: number | undefined) {
    this.originalTracks = [...newQueue];
    this.originalTracksCurrentIndex = undefined;

    this.shuffledTracksCurrentIndex = undefined;
    this.reshuffleTracks();

    if (playingTrackAtIndex !== undefined) {
      this.player.playTrackAtIndex(playingTrackAtIndex);
    } else {
      // recalculates next track
      this.onCurrentTrackIdentifierChanged(undefined);

      if (this.player.playbackIntentStarted) {
        nativePlayer.stop();
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
    }
  }

  setRepeatState(repeatState: PlayerRepeatState) {
    if (this._repeatState != repeatState) {
      this._repeatState = repeatState;

      this.recalculateNextTrack();
      this.onRepeatStateChanged.dispatch(repeatState);
      this.savePlayerState();
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
        nativePlayer.setNextStream(newNextTrack.toStreamable(this.player.enableStreamingCache));
      } else {
        nativePlayer.setNextStream(undefined);
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

      if (shuffledTrack.identifier == newIdentifier) {
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
  // endregion

  // region Player state serialization
  private playerStateDebounce: number | undefined = undefined;

  public savePlayerState() {
    if (this.playerStateDebounce) {
      clearTimeout(this.playerStateDebounce);
    }

    this.playerStateDebounce = setTimeout(() => {
      if (realm) {
        const state = {
          queueShuffleState: this.shuffleState,
          queueRepeatState: this.repeatState,
          queueSourceTrackUuids: this.originalTracks.map((t) => t.sourceTrack.uuid),
          queueSourceTrackShuffledUuids: this.shuffledTracks.map((t) => t.sourceTrack.uuid),
          activeSourceTrackIndex: this.originalTracksCurrentIndex,
          activeSourceTrackShuffledIndex: this.shuffledTracksCurrentIndex,
          lastUpdatedAt: new Date(),
          progress: this.player.progress?.percent,
          duration: this.player.progress?.duration,
          elapsed: this.player.progress?.elapsed,
        };
        const obj = PlayerState.upsert(realm, state);
        // logger.debug(`wrote player state: ${obj.debugState()}`);
        logger.debug('wrote player state');
      } else {
        logger.warn('Not writing player state -- realm is not available.');
      }
    }, 1000) as unknown as number;
  }

  public async restorePlayerState(realm: Realm) {
    const playerState = PlayerState.defaultObject(realm);

    if (!playerState) {
      logger.debug('No player state found to restore');
      return;
    }

    // allow the player to be fully set up
    // await this.player.stop();

    logger.debug(`restoring player state: ${playerState.debugState()}`);
    logger.debug('after init, before restore', this.player.debugState());

    const sourceTracksByUuid = groupByUuid([
      ...realm.objects(SourceTrack).filtered('uuid in $0', [...playerState.queueSourceTrackUuids]),
    ]);

    const makeQueue = (uuids: string[]) => {
      return uuids
        .map((u) => {
          const sourceTrack = sourceTracksByUuid[u];

          if (!sourceTrack) {
            return;
          }

          return PlayerQueueTrack.fromSourceTrack(sourceTrack);
        })
        .filter((t) => !!t) as PlayerQueueTrack[];
    };

    this.setShuffleState(playerState.queueShuffleState);
    this.setRepeatState(playerState.queueRepeatState);

    const unshuffledQueue = makeQueue(playerState.queueSourceTrackUuids);
    const shuffledQueue = [...unshuffledQueue];

    shuffledQueue.sort((a, b) => {
      const aOrder = playerState.queueSourceTrackShuffledUuids.indexOf(a.sourceTrack.uuid);
      const bOrder = playerState.queueSourceTrackShuffledUuids.indexOf(b.sourceTrack.uuid);

      return aOrder - bOrder;
    });

    this.replaceQueue(unshuffledQueue, undefined);
    this.shuffledTracks = shuffledQueue;
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);

    this.originalTracksCurrentIndex = playerState.activeSourceTrackIndex ?? 0;

    if (this.currentTrack) {
      this.onCurrentTrackChanged.dispatch(this.currentTrack);
    }

    // reset this so that when we start playing, it can properly call setNextStream
    this._nextTrack = undefined;
    this._nextTrackIndex = undefined;

    if (playerState.elapsed && playerState.progress && playerState.duration) {
      // very early seeks into a song are buggy
      const elapsed = playerState.elapsed <= 15 ? 0 : playerState.elapsed;

      this.player.seekToTime(elapsed).then(() => {});

      // forcibly update the UI
      sharedStateProgress.setState({
        elapsed: elapsed,
        duration: playerState.duration,
        percent: elapsed / playerState.duration,
      });
    }

    this.savePlayerState();
    logger.debug('finished restoring player state', this.player.debugState());
  }
  // endregion
}
