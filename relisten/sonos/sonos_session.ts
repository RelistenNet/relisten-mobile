import { randomUUID } from 'expo-crypto';
import { showMessage } from 'react-native-flash-message';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import type { PlaybackQueueContext } from '@/relisten/player/playback_driver';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import type { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  activeTrackDownloadProgress,
  currentTrackIdentifier,
  PlaybackSource,
  playbackSource,
  progress,
} from '@/relisten/player/shared_state';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';
import { log } from '@/relisten/util/logging';
import { SonosPlaybackDriver } from './sonos_driver';
import { handoffRequest } from './sonos_handoff';
import {
  estimatedPositionMillis,
  isSonosPlaying,
  type SonosPlayback,
  type SonosQueueEntry,
  type SonosTransport,
} from './sonos_playback';
import { sonosRemote, type SonosRemoteState, type SonosRemoteStore } from './sonos_remote';

const logger = log.extend('sonos-session');

const PROGRESS_INTERVAL_MS = 1000;

/** Builds phone queue entries for the room's order; undefined if a recording can't be found. */
export type RoomQueueTracks = (
  entries: readonly SonosQueueEntry[],
  phoneTracks: readonly PlayerQueueTrack[]
) => Promise<PlayerQueueTrack[] | undefined>;

type QueueSaveOutcome = 'saved' | 'notSaved' | 'refused';

/**
 * Plays the phone's queue on a Sonos room through the phone's own player, as
 * Cast does: the player keeps the one queue, and every screen reads only the
 * player. While the store controls a room:
 *
 * - the player's commands reach the room through `SonosPlaybackDriver`;
 * - the room's track, play state and playhead are published as the player's
 *   own (`publishRoom`), so the screens and the queue follow the room;
 * - the two queues are kept the same (`reconcileQueue`): phone edits are
 *   saved to the room, and an order saved on another device replaces the
 *   phone's.
 *
 * The phone and the room name each occurrence by the phone queue's
 * identifier, which is sent as the occurrence ID. Nothing is matched by
 * position or recording.
 *
 * Three kinds of work change the room or the phone's queue, and each owns
 * them until it finishes:
 * - a phone command (`transportDepth`): room reads are not published, since
 *   one taken before the room caught up would move the queue back;
 * - a queue save (`saving`): the phone's order is on its way to the room;
 * - a queue reload (`following`): the room's order is replacing the phone's.
 * `reconcileQueue` acts only when none of them is running.
 */
export class SonosSession {
  private readonly driver = new SonosPlaybackDriver(this);
  /** Whether the player is routed to the room. */
  private active = false;
  /**
   * The room's order as last confirmed to match the phone's: read and
   * adopted, or saved. Cleared when the room refuses an edit, so the next
   * reconcile reads the room again.
   */
  private roomQueue: { handle: string; version: number; occurrenceIds: string[] } | undefined;
  private transportDepth = 0;
  private saving: Promise<boolean> | undefined;
  /** An edit arrived during a save; it goes out in one more save after it. */
  private saveAgain = false;
  private following = false;
  /** A save that may not have arrived is retried quietly; the listener hears about it once. */
  private saveFailureShown = false;
  private previousRoom: SonosRemoteState = { kind: 'none' };
  private progressTimer: ReturnType<typeof setInterval> | undefined;
  private queueTracksForRoom: RoomQueueTracks | undefined;

  constructor(
    private readonly player: RelistenPlayer,
    private readonly store: SonosRemoteStore
  ) {}

  /** Follows the store and the phone's queue until the returned function is called. */
  start(queueTracksForRoom: RoomQueueTracks): () => void {
    this.queueTracksForRoom = queueTracksForRoom;
    const unsubscribe = this.store.subscribe(this.onRoomChanged);
    const removeQueueListener = this.player.queue.onOrderedTracksChanged.addListener(() => {
      if (this.active) {
        void this.saveQueue();
      }
    });
    this.onRoomChanged();

    return () => {
      unsubscribe();
      removeQueueListener();
      this.queueTracksForRoom = undefined;
    };
  }

  // region Phone to room: the driver's commands

  /** Sends play, pause or seek, then shows the room as it is. */
  async transport(transport: SonosTransport): Promise<void> {
    try {
      await this.whileTransporting(() => this.store.command(transport));
    } finally {
      this.publishLatestRoom();
    }
  }

  seekToFraction(fraction: number): Promise<void> {
    const room = this.store.getState();
    const durationMillis =
      (room.kind === 'active' ? room.playback.occurrence?.durationMillis : null) ??
      (this.player.progress?.duration ?? 0) * 1000;
    return durationMillis > 0
      ? this.transport({ action: 'seek', positionMillis: fraction * durationMillis })
      : Promise.resolve();
  }

  /**
   * Plays the occurrence the player selected. In the room's queue it is a
   * skip, sent after any queue edit is saved. A queue the room doesn't hold,
   * such as a newly chosen show, replaces the room's with a new handoff.
   */
  async playOccurrence(context: PlaybackQueueContext): Promise<void> {
    const target = context.orderedTracks[context.startIndex];
    if (!target) {
      return;
    }

    try {
      await this.whileTransporting(async () => {
        const room = this.store.getState();
        if (room.kind !== 'active') {
          return;
        }
        if (!this.phoneHas(room.playback.occurrence?.occurrenceId)) {
          await this.handOffPhoneQueue(room.playback, target, context.startTimeMs);
          return;
        }
        if (!(await this.saveQueue())) {
          return;
        }

        if (!(await this.store.command({ action: 'skip', occurrenceId: target.identifier }))) {
          return;
        }
        if (context.startTimeMs) {
          await this.store.command({ action: 'seek', positionMillis: context.startTimeMs });
        }
        const moved = this.store.getState();
        if (context.autoplay && moved.kind === 'active' && !isSonosPlaying(moved.playback)) {
          await this.store.command({ action: 'play' });
        }
      });
    } finally {
      // `playTrackAtIndex` clears `currentTrackIdentifier` and keeps its request open
      // (`nativePlayRequest`) until the selected identifier is published, queuing any
      // later selection behind it. Publishing the target always ends that request,
      // even when the room refused; publishing the room right after moves the queue
      // back to the room's track if it didn't follow.
      currentTrackIdentifier.setState(target.identifier);
      this.publishLatestRoom();
    }
  }

  /**
   * Replaces the room's queue with the phone's. If the room doesn't take it,
   * the phone's queue goes back to the room's, which is still playing.
   */
  private async handOffPhoneQueue(
    room: SonosPlayback,
    target: PlayerQueueTrack,
    startTimeMs: number | undefined
  ) {
    const request = handoffRequest({
      requestId: randomUUID(),
      groupId: room.groupId,
      tracks: this.player.queue.orderedTracks,
      currentIdentifier: target.identifier,
      positionSeconds: (startTimeMs ?? 0) / 1000,
    });
    if (!request) {
      return;
    }

    const outcome = await this.store.handOff(request, room.groupName);
    if (outcome.kind === 'playing') {
      return;
    }

    showMessage({
      message:
        outcome.kind === 'refused'
          ? outcome.message
          : `${room.groupName} didn’t confirm. Check the room before trying again.`,
      type: 'warning',
    });
    await this.followRoom();
  }

  private async whileTransporting<T>(work: () => Promise<T>): Promise<T> {
    this.transportDepth += 1;
    try {
      return await work();
    } finally {
      this.transportDepth -= 1;
    }
  }

  // endregion

  // region Room to phone: what the room is doing

  private onRoomChanged = () => {
    const room = this.store.getState();
    const previous = this.previousRoom;
    this.previousRoom = room;

    if (room.kind === 'none') {
      if (this.active) {
        this.returnToPhone(room.endedRoom);
      }
      return;
    }
    if (!this.active) {
      this.routeToRoom();
    }
    if (room.kind !== 'active' || room.pending) {
      return;
    }

    if (room.commandError && room.commandError !== commandErrorOf(previous)) {
      showMessage({ message: room.commandError, type: 'warning' });
    }
    this.publishRoom(room.playback);
    this.reconcileQueue(room.playback);
  };

  /** Routes the player to the room. The phone never plays alongside it. */
  private routeToRoom() {
    this.active = true;
    playbackSource.setState(PlaybackSource.Sonos);
    void this.player.getNativePlaybackDriver().pause();
    this.player.setPlaybackDriver(this.driver);
    activeTrackDownloadProgress.setState({ downloadedBytes: 0, totalBytes: 1, percent: 0 });
    this.progressTimer = setInterval(this.advanceProgress, PROGRESS_INTERVAL_MS);
  }

  /** Routes the player back to the phone. */
  private unrouteFromRoom() {
    this.active = false;
    this.roomQueue = undefined;
    clearInterval(this.progressTimer);
    this.progressTimer = undefined;
    this.player.setPlaybackDriver(this.player.getNativePlaybackDriver());
    playbackSource.setState(PlaybackSource.Native);
  }

  /** The room stopped playing this queue underneath the phone, or the account signed out. */
  private returnToPhone(endedRoom: string | undefined) {
    this.unrouteFromRoom();
    // Stopped, so Play starts the phone's stream at the saved position.
    void this.player.stop();
    if (endedRoom) {
      showMessage({ message: `${endedRoom} is no longer playing your queue.`, type: 'info' });
    }
  }

  /**
   * Shows the room's track, play state and playhead as the player's own. The
   * queue follows the track. Waits while a phone command owns the state, and
   * for an occurrence the phone doesn't hold yet (`reconcileQueue` adds it).
   */
  private publishRoom(playback: SonosPlayback) {
    const identifier = playback.occurrence?.occurrenceId;
    if (this.transportDepth > 0 || !this.phoneHas(identifier)) {
      return;
    }

    // Like a native report, this ends any buffering the player shows for a pending command.
    this.player.publishRemoteState(
      isSonosPlaying(playback) ? RelistenPlaybackState.Playing : RelistenPlaybackState.Paused
    );
    if (currentTrackIdentifier.lastState() !== identifier) {
      currentTrackIdentifier.setState(identifier);
    }
    this.publishProgress(playback);
  }

  private publishLatestRoom() {
    const room = this.store.getState();
    if (room.kind === 'active' && !room.pending) {
      this.publishRoom(room.playback);
    }
  }

  /** Between reads, the playhead advances from the last observation while the room plays. */
  private advanceProgress = () => {
    const room = this.store.getState();
    if (
      room.kind === 'active' &&
      !room.pending &&
      this.transportDepth === 0 &&
      isSonosPlaying(room.playback) &&
      this.phoneHas(room.playback.occurrence?.occurrenceId)
    ) {
      this.publishProgress(room.playback);
    }
  };

  private publishProgress(playback: SonosPlayback) {
    const elapsed = estimatedPositionMillis(playback, Date.now()) / 1000;
    const duration =
      (playback.occurrence?.durationMillis ?? 0) / 1000 ||
      this.player.queue.currentTrack?.sourceTrack.duration ||
      0;
    progress.setState({ elapsed, duration, percent: duration > 0 ? elapsed / duration : 0 });
  }

  // endregion

  // region The queue, kept the same on both

  /**
   * Makes the two queues the same once no command, save or reload is
   * running. The room's order wins when it is newer than the phone last
   * confirmed (another device edited it, or this device hasn't read it yet),
   * or when the phone doesn't hold the room's track (a newly chosen queue the
   * room didn't take). Otherwise an order the phone hasn't saved yet, from a
   * save that failed or had to wait, is saved now.
   */
  private reconcileQueue(playback: SonosPlayback) {
    if (this.transportDepth > 0 || this.saving || this.following) {
      return;
    }

    const known = this.roomQueue;
    const roomIsNewer =
      known?.handle !== playback.handle ||
      (playback.queueVersion !== null && playback.queueVersion > known.version);
    if (roomIsNewer || !this.phoneHas(playback.occurrence?.occurrenceId)) {
      void this.followRoom();
    } else if (!sameOrder(this.phoneOccurrenceIds(), known.occurrenceIds)) {
      void this.saveQueue();
    }
  }

  /** Takes the room's order, then shows the room's track in it. */
  private async followRoom() {
    this.following = true;
    try {
      await this.loadRoomQueue();
    } finally {
      this.following = false;
    }
    this.publishLatestRoom();
  }

  /**
   * Reads the room's queue and, if the phone's order differs, takes the
   * room's. Resolves whether the phone now holds the room's order.
   */
  private async loadRoomQueue(): Promise<boolean> {
    const read = await this.store.fetchQueue();
    if (!read || !this.active) {
      return false;
    }
    const occurrenceIds = read.queue.entries.map((entry) => entry.occurrenceId);
    const confirmed = { handle: read.handle, version: read.queue.version, occurrenceIds };
    if (sameOrder(this.phoneOccurrenceIds(), occurrenceIds)) {
      this.roomQueue = confirmed;
      return true;
    }

    const tracks = await this.queueTracksForRoom?.(
      read.queue.entries,
      this.player.queue.orderedTracks
    );
    if (!tracks || !this.active) {
      // Left unconfirmed, so the next reconcile reads the room again.
      logger.warn('The room’s queue has a recording this device couldn’t find');
      return false;
    }
    const room = this.store.getState();
    const current = room.kind === 'active' ? room.playback.occurrence?.occurrenceId : undefined;
    // Confirmed first: adopting announces the new order, which must not be saved back.
    this.roomQueue = confirmed;
    this.player.queue.adoptRemoteQueue(tracks, current);
    return true;
  }

  /**
   * Saves the phone's order to the room. Edits made while a save is in
   * flight go out in one more save after it; none is sent while the room's
   * order is replacing the phone's. Resolves whether the room has the
   * phone's order. When the room refuses the order, the phone takes the
   * room's.
   */
  private saveQueue(): Promise<boolean> {
    if (this.saving) {
      this.saveAgain = true;
      return this.saving;
    }
    if (this.following) {
      return Promise.resolve(false);
    }

    this.saving = this.saveUntilCurrent().then(
      (outcome) => {
        this.saving = undefined;
        if (outcome === 'refused') {
          void this.followRoom();
        }
        return outcome === 'saved';
      },
      (error: unknown) => {
        this.saving = undefined;
        throw error;
      }
    );
    return this.saving;
  }

  private async saveUntilCurrent(): Promise<QueueSaveOutcome> {
    let rereadRoom = false;
    for (;;) {
      this.saveAgain = false;
      const outcome = await this.saveQueueOnce();
      if (outcome === 'saved' && this.saveAgain) {
        continue;
      }
      if (outcome === 'trackMoved' && !rereadRoom) {
        // The room moved on since it was read; the edit still applies to the new track.
        rereadRoom = true;
        await this.store.refresh();
        continue;
      }
      return outcome === 'trackMoved' ? 'notSaved' : outcome;
    }
  }

  private async saveQueueOnce(): Promise<QueueSaveOutcome | 'trackMoved'> {
    const room = this.store.getState();
    const known = this.roomQueue;
    // A phone queue without the room's track is a different queue; playing it hands it off.
    if (
      room.kind !== 'active' ||
      known?.handle !== room.playback.handle ||
      !this.phoneHas(room.playback.occurrence?.occurrenceId)
    ) {
      return 'notSaved';
    }
    const entries = this.player.queue.orderedTracks.map(queueEntry);
    const occurrenceIds = entries.map((entry) => entry.occurrenceId);
    if (sameOrder(occurrenceIds, known.occurrenceIds)) {
      return 'saved';
    }

    const result = await this.store.saveQueue(entries, known.version);
    switch (result.kind) {
      case 'saved':
        this.roomQueue = { handle: known.handle, version: result.version, occurrenceIds };
        this.saveFailureShown = false;
        return 'saved';
      case 'trackMoved':
        return 'trackMoved';
      case 'refused':
        showMessage({ message: result.message, type: 'warning' });
        this.roomQueue = undefined;
        return 'refused';
      case 'failed':
        if (!this.saveFailureShown) {
          this.saveFailureShown = true;
          showMessage({ message: 'Couldn’t update the Sonos queue yet.', type: 'warning' });
        }
        return 'notSaved';
    }
  }

  // endregion

  // region Room back to the phone

  /**
   * Moves playback from the room to this phone at the same occurrence and
   * position, playing only if the room was. If the room's pause or position
   * can't be confirmed, nothing changes and the listener is told.
   */
  async transferToPhone(): Promise<void> {
    const room = this.store.getState();
    if (room.kind !== 'active') {
      return;
    }
    const roomName = room.playback.groupName;
    const wasPlaying = isSonosPlaying(room.playback);

    const stoppedAt = await this.whileTransporting(() => this.pauseRoomForTransfer(wasPlaying));
    const index = this.player.queue.orderedTracks.findIndex(
      (track) => track.identifier === stoppedAt?.identifier
    );
    if (!stoppedAt || index < 0) {
      this.publishLatestRoom();
      showMessage({ message: `Couldn’t move playback from ${roomName}.`, type: 'warning' });
      return;
    }

    this.unrouteFromRoom();
    this.store.release();
    await this.player.stop();
    if (wasPlaying) {
      this.player.playTrackAtIndex(index, stoppedAt.seconds);
    } else {
      // A stopped player keeps the selected track and position for the next Play.
      currentTrackIdentifier.setState(stoppedAt.identifier);
      void this.player.seekToTime(stoppedAt.seconds);
    }
  }

  /**
   * Pauses the room if it plays, then reads where it stopped and the room's
   * queue. Undefined unless the room is confirmed paused at a known position
   * and the phone holds the room's current order: another device may have
   * edited the upcoming tracks since the phone's last poll.
   */
  private async pauseRoomForTransfer(
    wasPlaying: boolean
  ): Promise<{ identifier: string; seconds: number } | undefined> {
    if (wasPlaying && !(await this.store.command({ action: 'pause' }))) {
      return undefined;
    }
    const latest = await this.store.refresh();
    const identifier = latest?.occurrence?.occurrenceId;
    if (!latest || !identifier || isSonosPlaying(latest) || latest.positionMillis === null) {
      return undefined;
    }

    if (!(await this.loadRoomQueue())) {
      return undefined;
    }
    return { identifier, seconds: latest.positionMillis / 1000 };
  }

  // endregion

  private phoneHas(identifier: string | undefined): boolean {
    return (
      identifier !== undefined &&
      this.player.queue.orderedTracks.some((track) => track.identifier === identifier)
    );
  }

  private phoneOccurrenceIds(): string[] {
    return this.player.queue.orderedTracks.map((track) => track.identifier);
  }
}

function queueEntry(track: PlayerQueueTrack): SonosQueueEntry {
  return {
    occurrenceId: track.identifier,
    trackId: formatUuidTypedId('track', track.sourceTrack.uuid),
  };
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function commandErrorOf(room: SonosRemoteState): string | undefined {
  return room.kind === 'active' ? room.commandError : undefined;
}

export const sonosSession = new SonosSession(RelistenPlayer.DEFAULT_INSTANCE, sonosRemote);
