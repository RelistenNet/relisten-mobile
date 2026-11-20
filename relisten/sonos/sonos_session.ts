import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import type { PlaybackQueueContext } from '@/relisten/player/playback_driver';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import type { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { currentTrackIdentifier, PlaybackSource, progress } from '@/relisten/player/shared_state';
import { log } from '@/relisten/util/logging';
import { SonosPlaybackDriver } from './sonos_driver';
import { HANDOFF_UNCONFIRMED_MESSAGE, handoffRequest } from './sonos_handoff';
import {
  estimatedPositionMillis,
  isSonosPlaying,
  type SonosPlayback,
  type SonosQueue,
  type SonosQueueEntry,
  sonosQueueEntry,
  type SonosTransport,
} from './sonos_playback';
import type { RoomQueueTracks } from './sonos_queue_tracks';
import {
  type SonosEnding,
  sonosRoom,
  sonosRoomName,
  type SonosRoomState,
  type SonosRoomStore,
} from './sonos_room_store';

const logger = log.extend('sonos-session');

const PROGRESS_INTERVAL_MS = 1000;
/** How long to wait before asking the catalog again about a room's queue it couldn't build. */
const LOOKUP_RETRY_MS = 30_000;
/**
 * A room's order the phone can never show (a gone recording Sonos keeps as
 * played) is left alone until the room's order changes.
 */
const UNTIL_THE_QUEUE_CHANGES = Infinity;

/** Builds the phone's queue for the room's order (`queueTracksForRoom`). */
export type BuildRoomQueue = (
  entries: readonly SonosQueueEntry[],
  phoneTracks: readonly PlayerQueueTrack[]
) => Promise<RoomQueueTracks>;

/**
 * What the phone's order is compared against, to tell an edit made on this
 * phone from one made on another device. Each is for one room handle.
 * - `agreed`: the order both last confirmed (a read that matched or was
 *   adopted, or a save), at `version`. Phone edits are saved against it.
 * - `handedOff`: the order this device just handed to the room, before the
 *   room's first read confirms a version.
 * - `roomWins`: the room refused the phone's order, so at the next read the
 *   room's order replaces the phone's, whatever the phone edited meanwhile.
 */
type QueueBaseline =
  | { kind: 'agreed'; handle: string; version: number; occurrenceIds: string[] }
  | { kind: 'handedOff'; handle: string; occurrenceIds: readonly string[] }
  | { kind: 'roomWins'; handle: string };

type AgreedQueue = Extract<QueueBaseline, { kind: 'agreed' }>;

/**
 * How reading the room's queue ended:
 * - `matches`: the phone already had the room's order.
 * - `phoneAhead`: the room still has the order both last agreed on, and the
 *   phone has edited it since; the phone's order should be saved.
 * - `adopted`: the phone took the room's order.
 * - `notTaken`: the room couldn't be read, or its order couldn't be built.
 */
type RoomQueueRead = 'matches' | 'phoneAhead' | 'adopted' | 'notTaken';

type SessionSave = { kind: 'saved' } | { kind: 'notSaved' } | { kind: 'refused'; message: string };

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
 * - a phone command (`commandsInFlight`): room reads are not published, since
 *   one taken before the room caught up would move the queue back. A handoff
 *   of a new show runs as a command too, which keeps `reconcileQueue` from
 *   putting the room's old order back while it settles, and a read already
 *   running gives up rather than take the old room's order meanwhile;
 * - a queue save (`saving`): the phone's order is on its way to the room;
 * - a queue read (`following`): the room's order may replace the phone's.
 *   No save starts meanwhile. An edit made during the read is found when it
 *   finishes, by comparing the phone's order with the baseline, and saved;
 *   a jump waits for the read before saving.
 * `reconcileQueue` acts only when none of them is running.
 */
export class SonosSession {
  private readonly driver = new SonosPlaybackDriver(this);
  /** Whether the player is routed to the room. */
  private active = false;
  /** What the phone's order is compared against; see `QueueBaseline`. */
  private baseline: QueueBaseline | undefined;
  /**
   * An order this phone sent whose response was lost: the room may hold it.
   * If a read finds it there, it is this phone's own save, not another
   * device's edit.
   */
  private unconfirmedSave: { handle: string; occurrenceIds: string[] } | undefined;
  /** A room order this phone couldn't build, left alone until it changes or `retryAt`. */
  private notFollowing: { handle: string; version: number; retryAt: number } | undefined;
  private commandsInFlight = 0;
  private saving: Promise<boolean> | undefined;
  /** An edit arrived during a save; it goes out in one more save after it. */
  private saveAgain = false;
  private following: Promise<RoomQueueRead> | undefined;
  /** A save that may not have arrived is retried quietly; the user hears about it once. */
  private saveFailureShown = false;
  private previousRoom: SonosRoomState = { kind: 'none' };
  private progressTimer: ReturnType<typeof setInterval> | undefined;
  private buildRoomQueue: BuildRoomQueue | undefined;

  constructor(
    private readonly player: RelistenPlayer,
    private readonly store: SonosRoomStore
  ) {}

  /** Follows the store and the phone's queue until the returned function is called. */
  start(buildRoomQueue: BuildRoomQueue): () => void {
    this.buildRoomQueue = buildRoomQueue;
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
      this.buildRoomQueue = undefined;
      if (this.active) {
        // The room keeps playing; a session started again routes back to it.
        this.unrouteFromRoom();
      }
    };
  }

  // region Phone to room: the driver's commands

  /** Sends play, pause or seek, then shows the room as it is. */
  async transport(transport: SonosTransport): Promise<void> {
    try {
      await this.whileCommanding(() => this.store.command(transport));
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
      await this.whileCommanding(async () => {
        const room = this.store.getState();
        if (room.kind !== 'active') {
          // Unconfirmed just now; the next confirmed reading puts the queue back on its track.
          return;
        }
        if (!this.phoneHas(room.playback.occurrence?.occurrenceId)) {
          await this.handOffPhoneQueue(room.playback, target, context.startTimeMs);
          return;
        }
        if (!(await this.roomHasPhoneOrder(room.playback)) || !this.phoneHas(target.identifier)) {
          // A read may have just replaced the queue the row was tapped in.
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
      // Publishing the target ends the player's play request even when the room
      // refused (see `PlaybackDriver.play`); publishing the room right after moves
      // the queue back to the room's track if it didn't follow.
      currentTrackIdentifier.setState(target.identifier);
      this.publishLatestRoom();
    }
  }

  /**
   * Handles the user removing the selected row. Sonos keeps every track
   * through the playing one, so the room skips to the next occurrence,
   * keeping play or pause (or stops at the end), and the row stays as
   * played. Like any jump, the skip waits for the phone's edits to reach the
   * room. A selected row that isn't the room's track means the phone's queue
   * hasn't caught up with the room, so nothing is sent.
   */
  moveOnFromSelected(identifier: string): boolean {
    const room = this.store.getState();
    if (room.kind !== 'active' || identifier !== this.roomOccurrenceId()) {
      showMessage({
        message: `The queue is still catching up with ${room.kind === 'none' ? 'Sonos' : sonosRoomName(room)}.`,
        type: 'info',
      });
      return true;
    }

    const tracks = this.player.queue.orderedTracks;
    const next = tracks[tracks.findIndex((track) => track.identifier === identifier) + 1];
    void this.moveOnTo(next);
    return true;
  }

  private async moveOnTo(next: PlayerQueueTrack | undefined) {
    const moved = await this.whileCommanding(async () => {
      const room = this.store.getState();
      if (room.kind !== 'active') {
        return false;
      }
      if (!next) {
        // At the end there is nothing to skip to; a playing room stops there.
        return !isSonosPlaying(room.playback) || this.store.command({ action: 'pause' });
      }
      return (
        (await this.roomHasPhoneOrder(room.playback)) &&
        this.phoneHas(next.identifier) &&
        this.store.command({ action: 'skip', occurrenceId: next.identifier })
      );
    });
    this.publishLatestRoom();
    if (moved) {
      showMessage({ message: 'Sonos keeps tracks once they’ve played.', type: 'info' });
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
    const inFlight = this.store.getHandoffInFlight();
    if (inFlight) {
      // That handoff decides the room's queue; following the old room now would undo this choice.
      showMessage({
        message: `Your queue is still moving to ${inFlight.groupName}.`,
        type: 'info',
      });
      return;
    }

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
      message: outcome.kind === 'refused' ? outcome.message : HANDOFF_UNCONFIRMED_MESSAGE,
      type: 'warning',
    });
    await this.followRoom();
  }

  private async whileCommanding<T>(work: () => Promise<T>): Promise<T> {
    this.commandsInFlight += 1;
    try {
      return await work();
    } finally {
      this.commandsInFlight -= 1;
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
        this.returnToPhone(room.ended);
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
    this.player.routeToRemote(this.driver, PlaybackSource.Sonos);
    this.progressTimer = setInterval(this.advanceProgress, PROGRESS_INTERVAL_MS);
  }

  /** Routes the player back to the phone. */
  private unrouteFromRoom() {
    this.active = false;
    this.baseline = undefined;
    this.unconfirmedSave = undefined;
    this.notFollowing = undefined;
    clearInterval(this.progressTimer);
    this.progressTimer = undefined;
    this.player.routeToNative();
  }

  /** The room stopped playing this queue underneath the phone, or the account signed out. */
  private returnToPhone(ended: SonosEnding | undefined) {
    this.unrouteFromRoom();
    // Stopped, so Play starts the phone's stream at the saved position.
    void this.player.stop();
    if (ended) {
      showMessage({
        message:
          ended.reason === 'reconnect'
            ? `Connect Sonos again to control ${ended.roomName}.`
            : `${ended.roomName} is no longer playing your queue.`,
        type: 'info',
      });
    }
  }

  /**
   * Shows the room's track, play state and playhead as the player's own. The
   * queue follows the track. Waits while a phone command owns the state, and
   * for an occurrence the phone doesn't hold yet (`reconcileQueue` adds it).
   */
  private publishRoom(playback: SonosPlayback) {
    const identifier = playback.occurrence?.occurrenceId;
    if (this.commandsInFlight > 0 || !this.phoneHas(identifier)) {
      return;
    }

    // Like a native report, this ends any buffering the player shows for a pending command.
    this.player.publishPlayState(
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

  /**
   * Between reads, the playhead advances from the last observation while the
   * room plays and the app is in front.
   */
  private advanceProgress = () => {
    const room = this.store.getState();
    if (
      AppState.currentState === 'active' &&
      room.kind === 'active' &&
      !room.pending &&
      this.commandsInFlight === 0 &&
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
    const shown = progress.lastState();
    if (shown?.elapsed === elapsed && shown.duration === duration) {
      return;
    }
    progress.setState({ elapsed, duration, percent: duration > 0 ? elapsed / duration : 0 });
  }

  // endregion

  // region The queue, kept the same on both

  /**
   * Makes the two queues the same once no command, save or read is running.
   * The room's order is read when it is newer than the one both agreed on
   * (another device edited it, or this device hasn't read it yet), or when
   * the phone doesn't hold the room's track (a newly chosen queue the room
   * didn't take). Otherwise an order the phone hasn't saved yet, from a save
   * that failed or had to wait, is saved now.
   */
  private reconcileQueue(playback: SonosPlayback) {
    if (this.commandsInFlight > 0 || this.saving || this.following) {
      return;
    }

    const agreed = this.agreedFor(playback.handle);
    const roomIsNewer =
      !agreed || (playback.queueVersion !== null && playback.queueVersion > agreed.version);
    if (roomIsNewer || !this.phoneHas(playback.occurrence?.occurrenceId)) {
      if (!this.waitingToFollow(playback)) {
        void this.followRoom();
      }
    } else if (!sameOrder(this.phoneOccurrenceIds(), agreed.occurrenceIds)) {
      void this.saveQueue();
    }
  }

  /**
   * Reads the room's queue and brings the phone in line with it, then shows
   * the room's track. An edit the phone made since the baseline, while the
   * room kept it, is saved rather than discarded. One read runs at a time.
   */
  private followRoom(): Promise<RoomQueueRead> {
    this.following ??= this.readThenFollowUp();
    return this.following;
  }

  private async readThenFollowUp(): Promise<RoomQueueRead> {
    let read: RoomQueueRead;
    try {
      read = await this.readRoomQueue();
    } finally {
      this.following = undefined;
    }

    if (read === 'phoneAhead') {
      void this.saveQueue();
    }
    this.publishLatestRoom();
    return read;
  }

  /**
   * Before a jump, the room must hold the phone's order. Waits for a read of
   * the room's queue already running, or reads it first when the phone has no
   * agreed order with this room yet (just after a handoff), then saves any
   * edit. Resolves whether the room has the phone's order.
   */
  private async roomHasPhoneOrder(playback: SonosPlayback): Promise<boolean> {
    if (this.following) {
      await this.following;
    } else if (!this.agreedFor(playback.handle) && !this.waitingToFollow(playback)) {
      await this.followRoom();
    }
    return this.saveQueue();
  }

  /**
   * Compares the room's order with the phone's and with the baseline, which
   * tells a phone edit apart from another device's. Only the latter replaces
   * the phone's order.
   */
  private async readRoomQueue(): Promise<RoomQueueRead> {
    const read = await this.store.readQueue();
    if (!read || !this.active) {
      return 'notTaken';
    }
    const roomIds = read.queue.entries.map((entry) => entry.occurrenceId);
    const confirmed: AgreedQueue = {
      kind: 'agreed',
      handle: read.handle,
      version: read.queue.version,
      occurrenceIds: roomIds,
    };
    if (this.unconfirmedSave?.handle === read.handle) {
      if (sameOrder(roomIds, this.unconfirmedSave.occurrenceIds)) {
        // The lost save arrived; it is the order both now agree on.
        this.baseline = confirmed;
      }
      this.unconfirmedSave = undefined;
    }
    const editedFrom = this.phoneEditedFrom(read.handle);

    if (sameOrder(this.phoneOccurrenceIds(), roomIds)) {
      this.baseline = confirmed;
      return 'matches';
    }
    if (editedFrom && sameOrder(roomIds, editedFrom)) {
      // The room kept the order the phone's edit started from.
      this.baseline = confirmed;
      return 'phoneAhead';
    }

    if (!this.stillFollowing(read.handle)) {
      return 'notTaken';
    }
    const built = await this.buildRoomQueue?.(read.queue.entries, this.player.queue.orderedTracks);
    if (!built || !this.stillFollowing(read.handle)) {
      return 'notTaken';
    }
    switch (built.kind) {
      case 'unreachable':
        logger.warn('Couldn’t look up a recording in the room’s queue');
        this.waitBeforeFollowing(read.handle, read.queue, LOOKUP_RETRY_MS);
        return 'notTaken';
      case 'unavailable':
        return this.dropUnavailable(read.handle, read.queue, built.occurrenceIds);
      case 'built':
        return this.takeRoomOrder(confirmed, built.tracks, editedFrom);
    }
  }

  /**
   * Whether the room's order read for `handle` may still change the phone's.
   * Not once the phone stopped following the room, the room changed, or a
   * handoff is choosing a new room: taking the old room's order then would
   * undo the queue being handed off.
   */
  private stillFollowing(handle: string): boolean {
    const room = this.store.getState();
    return (
      this.active &&
      room.kind === 'active' &&
      room.playback.handle === handle &&
      !this.store.getHandoffInFlight()
    );
  }

  /**
   * The order the phone's current order was edited from, if its edits may
   * stand: none after the room refused the phone's order, and none when the
   * phone doesn't hold the room's playing track, since that is a different
   * queue (a new show the room didn't take), not an edit of the room's.
   */
  private phoneEditedFrom(handle: string): readonly string[] | undefined {
    const baseline = this.currentBaseline(handle);
    if (!baseline || baseline.kind === 'roomWins' || !this.phoneHas(this.roomOccurrenceId())) {
      return undefined;
    }
    return baseline.occurrenceIds;
  }

  /**
   * Moves the baseline to `handle` and returns it. A baseline for another
   * handle no longer applies and is dropped; the first time the session meets
   * a handle this device handed off, the handed-off order becomes the
   * baseline (taken from the store, which hands it over once).
   */
  private currentBaseline(handle: string): QueueBaseline | undefined {
    if (this.baseline?.handle !== handle) {
      const handedOff = this.store.takeHandedOffOrder(handle);
      this.baseline = handedOff
        ? { kind: 'handedOff', handle, occurrenceIds: handedOff }
        : undefined;
    }
    return this.baseline;
  }

  private agreedFor(handle: string): AgreedQueue | undefined {
    const baseline = this.currentBaseline(handle);
    return baseline?.kind === 'agreed' ? baseline : undefined;
  }

  /**
   * Replaces the phone's queue with the room's. If the phone's order moved
   * away from the agreed one, that edit loses to another device's, and the
   * user is told.
   */
  private takeRoomOrder(
    confirmed: AgreedQueue,
    tracks: PlayerQueueTrack[],
    editedFrom: readonly string[] | undefined
  ): RoomQueueRead {
    const phoneEdited =
      editedFrom !== undefined && !sameOrder(this.phoneOccurrenceIds(), editedFrom);
    // `stillFollowing` held, so the room is confirmed and names its track.
    const current = this.roomOccurrenceId();

    // Agreed first: adopting announces the new order, which must not be saved back.
    this.baseline = confirmed;
    this.player.queue.adoptRemoteQueue(tracks, current);
    if (phoneEdited) {
      showMessage({
        message: 'Your queue change was replaced by one from another device.',
        type: 'warning',
      });
    }
    return 'adopted';
  }

  /**
   * The catalog says some of the room's recordings are gone. Upcoming ones
   * are removed from the room's queue, which keeps both queues the same.
   * This is the one edit the phone makes on its own; it runs inside the read
   * (`following`), so no phone save can cross it, and it reads the room again
   * afterwards, which ends once no gone recording is left.
   *
   * The baseline stays as it was: the gone tracks came from another device's
   * edit, so the read afterwards tells the phone's own edits from it as usual.
   *
   * Sonos keeps every track through the playing one, so if any of those is
   * gone, the phone can't show the room's queue. It leaves that order alone
   * until it changes; meanwhile the phone's edits and jumps aren't sent, since
   * the room's order is newer than anything they could be based on.
   */
  private async dropUnavailable(
    handle: string,
    queue: SonosQueue,
    goneIds: readonly string[]
  ): Promise<RoomQueueRead> {
    // The playing track comes from the latest room reading, which can be a
    // moment newer than this queue; a mismatch only makes the edit refused.
    const playingId = this.roomOccurrenceId();
    const playingIndex = queue.entries.findIndex((entry) => entry.occurrenceId === playingId);
    const gone = new Set(goneIds);
    const goneAreAllUpcoming =
      playingIndex >= 0 &&
      queue.entries.every((entry, index) => !gone.has(entry.occurrenceId) || index > playingIndex);

    if (!goneAreAllUpcoming) {
      this.waitBeforeFollowing(handle, queue, UNTIL_THE_QUEUE_CHANGES);
      showMessage({
        message: 'The room’s queue has a track that’s no longer available, so it can’t be shown.',
        type: 'warning',
      });
      return 'notTaken';
    }

    const kept = queue.entries.filter((entry) => !gone.has(entry.occurrenceId));
    const saved = await this.store.saveQueue(kept, queue.version);
    if (saved.kind !== 'saved') {
      this.waitBeforeFollowing(handle, queue, LOOKUP_RETRY_MS);
      return 'notTaken';
    }
    showMessage({
      message:
        gone.size === 1
          ? 'Removed a track that’s no longer available.'
          : `Removed ${gone.size} tracks that are no longer available.`,
      type: 'info',
    });
    return this.readRoomQueue();
  }

  /** Leaves `queue` alone until the room's order changes or `delayMs` passes. */
  private waitBeforeFollowing(handle: string, queue: SonosQueue, delayMs: number) {
    this.notFollowing = { handle, version: queue.version, retryAt: Date.now() + delayMs };
  }

  private waitingToFollow(playback: SonosPlayback): boolean {
    const notFollowing = this.notFollowing;
    return (
      notFollowing !== undefined &&
      notFollowing.handle === playback.handle &&
      notFollowing.version === playback.queueVersion &&
      Date.now() < notFollowing.retryAt
    );
  }

  /**
   * Saves the phone's order to the room. Edits made while a save is in
   * flight go out in one more save after it; none is sent while the room's
   * order is being read (the read checks for them when it finishes).
   * Resolves whether the room has the phone's order. When the room refuses
   * the order, the phone takes the room's.
   */
  private saveQueue(): Promise<boolean> {
    if (this.saving) {
      this.saveAgain = true;
      return this.saving;
    }
    if (this.following) {
      return Promise.resolve(false);
    }

    this.saving = this.saveThenFollowUp();
    return this.saving;
  }

  private async saveThenFollowUp(): Promise<boolean> {
    let outcome: SessionSave;
    try {
      outcome = await this.saveUntilCurrent();
    } finally {
      this.saving = undefined;
    }

    if (outcome.kind === 'refused') {
      this.roomRefusedOrder(outcome.message);
    }
    return outcome.kind === 'saved';
  }

  /**
   * The room keeps its order (another device's edit won, or the edit changed
   * a track Sonos keeps). The user is told, and the room's order replaces the
   * phone's, whatever the phone edited since.
   */
  private roomRefusedOrder(message: string) {
    showMessage({ message, type: 'warning' });
    // Without a baseline the room's order already wins at the next read.
    const handle = this.baseline?.handle;
    if (handle !== undefined) {
      this.baseline = { kind: 'roomWins', handle };
    }
    void this.followRoom();
  }

  private async saveUntilCurrent(): Promise<SessionSave> {
    let rereadRoom = false;
    for (;;) {
      this.saveAgain = false;
      const outcome = await this.saveQueueOnce();
      if (outcome.kind === 'saved' && this.saveAgain) {
        continue;
      }
      if (outcome.kind === 'trackMoved' && !rereadRoom) {
        // The room moved on since it was read. The edit still applies, but
        // Sonos now keeps the track it moved to, and those before it, so the
        // phone's order puts them back in the room's order first.
        rereadRoom = true;
        await this.store.refresh();
        this.keepRoomPlayedOrder();
        continue;
      }
      return outcome.kind === 'trackMoved' ? { kind: 'notSaved' } : outcome;
    }
  }

  /** Puts the room's tracks through its playing one first in the phone's order, as in the room's. */
  private keepRoomPlayedOrder() {
    const room = this.store.getState();
    const agreed = room.kind === 'active' ? this.agreedFor(room.playback.handle) : undefined;
    const playingIndex = agreed?.occurrenceIds.indexOf(this.roomOccurrenceId() ?? '') ?? -1;
    if (!agreed || playingIndex < 0) {
      return;
    }
    this.publishLatestRoom();
    this.player.queue.keepPlayedOrder(agreed.occurrenceIds.slice(0, playingIndex + 1));
  }

  private async saveQueueOnce(): Promise<SessionSave | { kind: 'trackMoved' }> {
    const room = this.store.getState();
    // A phone queue without the room's track is a different queue; playing it hands it off.
    const agreed = room.kind === 'active' ? this.agreedFor(room.playback.handle) : undefined;
    if (!agreed || !this.phoneHas(this.roomOccurrenceId())) {
      return { kind: 'notSaved' };
    }
    const roomVersion = room.kind === 'active' ? room.playback.queueVersion : null;
    if (roomVersion !== null && roomVersion > agreed.version) {
      // The room's order changed since; the next read decides which order stands.
      return { kind: 'notSaved' };
    }
    const entries = this.player.queue.orderedTracks.map(sonosQueueEntry);
    const occurrenceIds = entries.map((entry) => entry.occurrenceId);
    if (sameOrder(occurrenceIds, agreed.occurrenceIds)) {
      return { kind: 'saved' };
    }

    const result = await this.store.saveQueue(entries, agreed.version);
    switch (result.kind) {
      case 'saved':
        this.baseline = { ...agreed, version: result.version, occurrenceIds };
        this.saveFailureShown = false;
        return { kind: 'saved' };
      case 'trackMoved':
      case 'refused':
        return result;
      case 'failed':
        this.unconfirmedSave = { handle: agreed.handle, occurrenceIds };
        if (!this.saveFailureShown) {
          this.saveFailureShown = true;
          showMessage({ message: 'Couldn’t update the Sonos queue yet.', type: 'warning' });
        }
        return { kind: 'notSaved' };
    }
  }

  // endregion

  // region Room back to the phone

  /**
   * Moves playback from the room to this phone at the same occurrence and
   * position, playing only if the room was. If the room's pause, position or
   * queue can't be confirmed, nothing changes and the user is told.
   */
  async transferToPhone(): Promise<void> {
    const room = this.store.getState();
    if (room.kind !== 'active') {
      return;
    }
    const roomName = room.playback.groupName;
    const wasPlaying = isSonosPlaying(room.playback);

    const stoppedAt = await this.whileCommanding(() => this.pauseRoomForTransfer(wasPlaying));
    if (!this.active) {
      // The room ended meanwhile; the queue is already back on the phone, and the user was told.
      return;
    }
    const index = this.player.queue.orderedTracks.findIndex(
      (track) => track.identifier === stoppedAt?.identifier
    );
    if (!stoppedAt || index < 0) {
      this.publishLatestRoom();
      showMessage({ message: `Couldn’t move playback from ${roomName}.`, type: 'warning' });
      return;
    }

    // Unrouted before the release, so the store's `none` doesn't also stop the phone.
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

    if ((await this.followRoom()) === 'notTaken') {
      return undefined;
    }
    return { identifier, seconds: latest.positionMillis / 1000 };
  }

  // endregion

  /** The occurrence the room plays, once it has been read and confirmed. */
  private roomOccurrenceId(): string | undefined {
    const room = this.store.getState();
    return room.kind === 'active' ? room.playback.occurrence?.occurrenceId : undefined;
  }

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

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function commandErrorOf(room: SonosRoomState): string | undefined {
  return room.kind === 'active' ? room.commandError : undefined;
}

export const sonosSession = new SonosSession(RelistenPlayer.DEFAULT_INSTANCE, sonosRoom);
