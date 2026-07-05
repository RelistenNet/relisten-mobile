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
import {
  PlayerCheckpointProps,
  PlayerState,
  PlayerStateProps,
} from '@/relisten/realm/models/player_state';
import { PlayerRepeatState, PlayerShuffleState } from '@/relisten/player/player_modes';
import { log } from '@/relisten/util/logging';
import { groupByUuid } from '@/relisten/util/group_by';
import { Realm } from '@realm/react';
import { v4 as uuid } from 'uuid';
import { indentString } from '@/relisten/util/string_indent';

export { PlayerRepeatState, PlayerShuffleState } from '@/relisten/player/player_modes';

const logger = log.extend('player-queue');

function shuffleArray<T>(arr: T[]) {
  // ye old fisher-yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    // swap
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

const queueInstanceId = uuid();
let queueTrackId = 0;
// This caps the max tracks in queue at 100B
const MAX_QUEUE_TRACK_ID = 100_000_000_000;

function nextQueueTrackId() {
  queueTrackId++;

  if (queueTrackId >= MAX_QUEUE_TRACK_ID) {
    queueTrackId = 0;
  }

  return queueInstanceId + '_' + queueTrackId.toFixed(0);
}

export class PlayerQueueTrack {
  public identifier: string;

  renewIdentifier() {
    this.identifier = nextQueueTrackId();
  }

  constructor(
    public readonly sourceTrack: SourceTrack,
    public readonly title: string,
    public readonly artist: string,
    public readonly subtitle: string,
    public readonly albumTitle: string,
    public readonly albumArt: string
  ) {
    this.identifier = nextQueueTrackId();
  }

  /** Copy playback metadata into a fresh occurrence without changing this entry. */
  newOccurrence(): PlayerQueueTrack {
    return new PlayerQueueTrack(
      this.sourceTrack,
      this.title,
      this.artist,
      this.subtitle,
      this.albumTitle,
      this.albumArt
    );
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
      [artist.name, source.displayDate, venue?.name, venue?.location]
        .filter((part) => !!part)
        .join(' • ') || '',
      [source.displayDate, venue?.name].filter((part) => !!part).join(' • ') || '',
      albumArtUrl
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
    const newEntries = queueTracks.map((track) => track.newOccurrence());
    function insertNext(arr: PlayerQueueTrack[], currentIndex: number | undefined) {
      const targetIndex = currentIndex !== undefined ? currentIndex + 1 : 0;
      const arrCopy = [...arr];

      arrCopy.splice(targetIndex, 0, ...newEntries);

      return arrCopy;
    }

    this.originalTracks = insertNext(this.originalTracks, this.originalTracksCurrentIndex);
    this.shuffledTracks = insertNext(this.shuffledTracks, this.shuffledTracksCurrentIndex);

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState(true);
  }

  addTrackToEndOfQueue(queueTracks: PlayerQueueTrack[]) {
    const newEntries = queueTracks.map((track) => track.newOccurrence());
    this.originalTracks = [...this.originalTracks, ...newEntries];
    this.shuffledTracks = [...this.shuffledTracks, ...newEntries];

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState(true);
  }

  reorderQueue(newQueue: PlayerQueueTrack[]) {
    const currentIdentifier = this.currentTrack?.identifier;
    this.originalTracks = [...newQueue];
    this.reshuffleTracks();

    if (currentIdentifier) this.recalculateTrackIndexes(currentIdentifier);

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState(true);
  }

  moveQueueTrack(from: number, to: number) {
    function reorderItems<T>(data: T[], from: number, to: number): T[] {
      const newData = [...data];
      newData.splice(to, 0, newData.splice(from, 1)[0]);
      return newData;
    }

    const currentIdentifier = this.currentTrack?.identifier;
    // if in a shuffled state,
    if (this.shuffleState == PlayerShuffleState.SHUFFLE_ON) {
      this.shuffledTracks = reorderItems(this.shuffledTracks, from, to);
    } else {
      this.originalTracks = reorderItems(this.originalTracks, from, to);
    }

    if (currentIdentifier) this.recalculateTrackIndexes(currentIdentifier);
    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
    this.savePlayerState(true);
  }

  replaceQueue(
    newQueue: PlayerQueueTrack[],
    playingTrackAtIndex: number | undefined,
    options?: { resetShuffle?: boolean }
  ) {
    this.player.cancelPendingPlayRequests('replaceQueue');
    // Replacing a queue invalidates native callbacks, including reused entry objects.
    for (const track of newQueue) track.renewIdentifier();
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
    this.savePlayerState(true);
  }

  removeTrackAtIndex(index: number) {
    const identifier = this.orderedTracks[index]?.identifier;
    return identifier ? this.removeTrackWithIdentifier(identifier) : false;
  }

  removeTrackWithIdentifier(identifier: string) {
    const removed = this.originalTracks.find((track) => track.identifier === identifier);
    if (!removed) {
      return false;
    }
    const currentIdentifier = this.currentTrack?.identifier;

    this.applyPlaybackCheckpoint(() => {
      const stoppedPlayback = this.player.onQueueTrackRemoving(removed.identifier);
      this.originalTracks = this.originalTracks.filter(
        (entry) => entry.identifier !== removed.identifier
      );
      this.shuffledTracks = this.shuffledTracks.filter(
        (entry) => entry.identifier !== removed.identifier
      );
      if (currentIdentifier) {
        this.recalculateTrackIndexes(currentIdentifier);
      }

      if (!stoppedPlayback) {
        this.recalculateNextTrack();
      }
      this.onOrderedTracksChanged.dispatch(this.orderedTracks);
      if (removed.identifier === currentIdentifier) {
        this.onCurrentTrackChanged.dispatch(undefined);
      }
    }, true);
    return true;
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
      this.savePlayerState(true);
      nativePlayer.setShuffleMode(shuffleState);
    }
  }

  setRepeatState(repeatState: PlayerRepeatState) {
    if (this._repeatState != repeatState) {
      this._repeatState = repeatState;

      this.recalculateNextTrack();
      this.onRepeatStateChanged.dispatch(repeatState);
      this.savePlayerState(true);
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
  /** Drop cached lookahead when the backend queue is stopped or cleared. */
  public forgetPreparedNextTrack() {
    this._nextTrack = undefined;
    this._nextTrackIndex = undefined;
  }

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
    this.savePlayerState(true);
  };

  private recalculateTrackIndexes(newIdentifier: string) {
    this.clearCurrentTrack();
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
  private checkpointTimer: ReturnType<typeof setTimeout> | undefined;
  private restoring = false;
  private checkpointDepth = 0;
  private lastWrittenState?: string;

  /** Lifecycle notifications before startup restore must not erase a saved queue. */
  public flushPlayerState() {
    if (this.originalTracks.length > 0) {
      this.savePlayerState(true);
    }
  }

  /** Selection and timing must cross the Realm boundary together. */
  public applyPlaybackCheckpoint(apply: () => void, immediate: boolean) {
    this.checkpointDepth += 1;
    try {
      apply();
    } finally {
      this.checkpointDepth -= 1;
    }
    this.savePlayerState(immediate);
  }

  public savePlayerState(immediate = false) {
    if (this.restoring || this.checkpointDepth > 0) {
      return;
    }
    if (immediate) {
      if (this.checkpointTimer !== undefined) {
        clearTimeout(this.checkpointTimer);
      }
      this.checkpointTimer = undefined;
      this.writePlayerState();
    } else if (this.checkpointTimer === undefined) {
      // Never postpone an existing deadline when more progress or queue edits arrive.
      this.checkpointTimer = setTimeout(() => {
        this.checkpointTimer = undefined;
        this.writePlayerState();
      }, 5000);
    }
  }

  private writePlayerState() {
    if (!realm) {
      return;
    }
    const track = this.currentTrack;
    const progress = track ? this.player.checkpointProgress(track.identifier) : undefined;
    const duration = progress?.duration ?? track?.sourceTrack.duration;
    const state: Omit<PlayerStateProps, 'lastUpdatedAt'> = {
      queueEntries: this.originalTracks.map((track) => ({
        id: track.identifier,
        sourceTrackUuid: track.sourceTrack.uuid,
      })),
      shuffleOrder:
        this.shuffleState === PlayerShuffleState.SHUFFLE_ON
          ? { entryIds: this.shuffledTracks.map((track) => track.identifier) }
          : null,
      repeatMode: this.repeatState,
      checkpoint: track
        ? {
            entryId: track.identifier,
            elapsedSeconds: progress?.elapsed ?? 0,
            durationSeconds: duration != null && duration > 0 ? duration : null,
          }
        : null,
    };
    const fingerprint = JSON.stringify(state);
    if (fingerprint === this.lastWrittenState) {
      return;
    }
    PlayerState.upsert(realm, { ...state, lastUpdatedAt: new Date() });
    this.lastWrittenState = fingerprint;
  }

  public async restorePlayerState(realm: Realm) {
    this.player.prepareForPlayerStateRestore();
    const playerState = PlayerState.defaultObject(realm);

    if (!playerState) {
      logger.debug('No player state found to restore');
      return;
    }

    this.restoring = true;
    try {
      const tracksByEntryId = this.loadSavedQueueTracks(realm, playerState);
      this.restoreQueueOrder(playerState, tracksByEntryId);
      this.restoreSelection(playerState.checkpoint, tracksByEntryId);

      if (tracksByEntryId.size < playerState.queueEntries.length) {
        logger.warn(
          'Persisted player state referenced invalid queue tracks; rewriting sanitized state'
        );
      }
    } catch (error) {
      logger.warn('Failed to restore persisted player state; clearing saved queue', error);
      PlayerState.clear(realm);
      this.replaceQueue([], undefined);
    } finally {
      this.restoring = false;
      this.savePlayerState(true);
    }
  }

  private loadSavedQueueTracks(realm: Realm, saved: PlayerState) {
    const sourceUuids = saved.queueEntries.map((entry) => entry.sourceTrackUuid);
    const catalog = groupByUuid([
      ...realm.objects(SourceTrack).filtered('uuid in $0', sourceUuids),
    ]);
    const tracksByEntryId = new Map<string, PlayerQueueTrack>();

    for (const entry of saved.queueEntries) {
      const sourceTrack = catalog[entry.sourceTrackUuid];
      if (!sourceTrack) {
        continue;
      }
      try {
        const track = PlayerQueueTrack.fromSourceTrack(sourceTrack);
        track.identifier = entry.id;
        tracksByEntryId.set(entry.id, track);
      } catch (error) {
        logger.warn('Skipping invalid persisted queue track during restore', {
          error,
          sourceTrackUuid: entry.sourceTrackUuid,
        });
      }
    }
    return tracksByEntryId;
  }

  private restoreQueueOrder(saved: PlayerState, tracksByEntryId: Map<string, PlayerQueueTrack>) {
    // Restore keeps occurrence IDs; replacing a queue renews them to reject old callbacks.
    this.player.cancelPendingPlayRequests('restorePlayerState');
    this.originalTracks = [...tracksByEntryId.values()];
    this.shuffledTracks = [...this.originalTracks];
    this._shuffleState = PlayerShuffleState.SHUFFLE_OFF;
    if (saved.shuffleOrder) {
      this.shuffledTracks = saved.shuffleOrder.entryIds
        .map((id) => tracksByEntryId.get(id))
        .filter((track): track is PlayerQueueTrack => track !== undefined);
      this._shuffleState = PlayerShuffleState.SHUFFLE_ON;
    }
    this._repeatState = saved.repeatMode;
    this.clearCurrentTrack();
    this.prevNextTrackIndexIntentOffset = 0;

    this.onShuffleStateChanged.dispatch(this.shuffleState);
    this.onRepeatStateChanged.dispatch(this.repeatState);
    nativePlayer.setShuffleMode(this.shuffleState);
    nativePlayer.setRepeatMode(this.repeatState);
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
  }

  private restoreSelection(
    checkpoint: PlayerCheckpointProps | null,
    tracksByEntryId: Map<string, PlayerQueueTrack>
  ) {
    if (!checkpoint) {
      // A saved queue can intentionally have no selection.
      this.forgetPreparedNextTrack();
      return;
    }

    const selectedTrack = tracksByEntryId.get(checkpoint.entryId);
    const track = selectedTrack ?? this.orderedTracks[0];
    if (track) {
      this.recalculateTrackIndexes(track.identifier);
      this.onCurrentTrackChanged.dispatch(track);
    }

    // Selection listeners must not prepare a native stream before an explicit Play.
    this.forgetPreparedNextTrack();
    if (!track) {
      return;
    }

    // A missing selected source cannot transfer its timing to the fallback entry.
    let elapsed = 0;
    let savedDuration: number | null | undefined;
    if (selectedTrack) {
      elapsed = Math.max(0, checkpoint.elapsedSeconds);
      savedDuration = checkpoint.durationSeconds;
    }
    const duration = [savedDuration, track.sourceTrack.duration].find(
      (candidate) => candidate != null && Number.isFinite(candidate) && candidate > 0
    );
    let percent = 0;
    if (duration != null) {
      elapsed = Math.min(elapsed, duration);
      percent = elapsed / duration;
    }
    const progress = { elapsed, duration: duration ?? 0, percent };
    void this.player.seekToTime(elapsed);
    this.player.progress = progress;
    sharedStateProgress.setState(progress);
  }
  // endregion
}
