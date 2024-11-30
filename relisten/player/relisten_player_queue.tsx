import { nativePlayer, RelistenStreamable } from '@/modules/relisten-audio-player';
import { addPlayerListeners } from '@/relisten/player/native_playback_state_hooks';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import { currentTrackIdentifier } from '@/relisten/player/shared_state';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { EventSource } from '@/relisten/util/event_source';
import { Source } from '@/relisten/realm/models/source';
import { Artist } from '@/relisten/realm/models/artist';
import { Venue } from '@/relisten/realm/models/venue';
import { SourceTrackOfflineInfoStatus } from '@/relisten/realm/models/source_track_offline_info';

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

  static fromSourceTrack(
    sourceTrack: SourceTrack,
    source: Source,
    artist?: Artist | null,
    venue?: Venue | null
  ) {
    return new PlayerQueueTrack(
      sourceTrack,
      sourceTrack.title,
      [artist?.name, source.displayDate, venue?.name].filter((part) => !!part).join(' • ') || '',
      [source.displayDate, venue?.name].filter((part) => !!part).join(' • ') || '',
      'https://fastly.picsum.photos/id/311/550/550.jpg?hmac=HTOiKPHI1RJtHRyl2E88Qi1UeX_gIMSfKxwJzd9mWFg'
      // `https://sonos.relisten.net/album-art/${artist?.slug}/years/${year}/${year}-${month}-${day}/${source.id}/550.png`
    );
  }

  toStreamable(): RelistenStreamable {
    let url = this.sourceTrack.mp3Url;
    let downloadDestination: string | undefined = undefined;

    if (this.sourceTrack.offlineInfo?.isPlayableOffline()) {
      url = 'file://' + this.sourceTrack.downloadedFileLocation();
    } else {
      downloadDestination = 'file://' + this.sourceTrack.downloadedFileLocation();
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
}

export class RelistenPlayerQueue {
  constructor(public readonly player: RelistenPlayer) {}

  // region Private fields
  private _shuffleState = PlayerShuffleState.SHUFFLE_OFF;
  private _repeatState = PlayerRepeatState.REPEAT_OFF;

  private _nextTrack?: PlayerQueueTrack;

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
  }

  addTrackToEndOfQueue(queueTracks: PlayerQueueTrack[]) {
    this.originalTracks = [...this.originalTracks, ...queueTracks];
    this.shuffledTracks = [...this.shuffledTracks, ...queueTracks];

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
  }

  reorderQueue(newQueue: PlayerQueueTrack[]) {
    this.originalTracks = [...newQueue];
    this.reshuffleTracks();

    if (this.currentTrack !== undefined) {
      this.recalculateTrackIndexes(this.currentTrack.identifier);
    }

    this.recalculateNextTrack();
    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
  }

  replaceQueue(newQueue: PlayerQueueTrack[], playingTrackAtIndex: number | undefined) {
    this.originalTracks = [...newQueue];
    this.originalTracksCurrentIndex = undefined;

    this.shuffledTracksCurrentIndex = undefined;
    this.reshuffleTracks();

    if (playingTrackAtIndex !== undefined) {
      // recalculates next track
      this.playTrackAtIndex(playingTrackAtIndex);
    } else {
      // recalculates next track
      this.onCurrentTrackIdentifierChanged(undefined);
      nativePlayer.stop().then(() => {});
    }

    this.onOrderedTracksChanged.dispatch(this.orderedTracks);
  }

  playTrackAtIndex(index: number) {
    const newIndex = Math.max(0, Math.min(index, this.orderedTracks.length - 1));

    nativePlayer.play(this.orderedTracks[newIndex].toStreamable()).then(() => {});

    this.recalculateNextTrack();
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
    }
  }

  setRepeatState(repeatState: PlayerRepeatState) {
    if (this._repeatState != repeatState) {
      this._repeatState = repeatState;

      this.recalculateNextTrack();
      this.onRepeatStateChanged.dispatch(repeatState);
    }
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
  private recalculateNextTrack() {
    const prevNextTrack = this._nextTrack;
    const newNextTrack = this.calculateNextTrack();

    this._nextTrack = newNextTrack;

    if (newNextTrack?.identifier !== prevNextTrack?.identifier) {
      if (newNextTrack) {
        nativePlayer.setNextStream(newNextTrack.toStreamable());
      } else {
        nativePlayer.setNextStream(undefined);
      }
    }
  }

  private calculateNextTrack(): PlayerQueueTrack | undefined {
    if (this.currentIndex === undefined) {
      return undefined;
    }

    if (this.repeatState === PlayerRepeatState.REPEAT_TRACK) {
      return this.currentTrack;
    }

    const maybeNextIndex = this.currentIndex + 1;

    if (maybeNextIndex < this.orderedTracks.length) {
      return this.orderedTracks[maybeNextIndex];
    }

    if (this.repeatState === PlayerRepeatState.REPEAT_QUEUE) {
      return this.orderedTracks[0];
    } else if (this.repeatState === PlayerRepeatState.REPEAT_OFF) {
      return undefined;
    }

    return undefined;
  }

  // endregion

  // region Cleanup
  private clearCurrentTrack() {
    this.originalTracksCurrentIndex = undefined;
    this.shuffledTracksCurrentIndex = undefined;
  }

  private clearNextTrack() {
    this._nextTrack = undefined;
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

  private onCurrentTrackIdentifierChanged = (newIdentifier?: string) => {
    this.clearCurrentTrack();

    if (newIdentifier !== undefined) {
      this.recalculateTrackIndexes(newIdentifier);
      this.currentTrackPlaybackStartedAt = new Date();
    } else {
      this.currentTrackPlaybackStartedAt = undefined;
    }

    this.recalculateNextTrack();
    this.onCurrentTrackChanged.dispatch(this.currentTrack);
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
}
