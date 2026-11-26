import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';
import { showToast } from '@/relisten/components/toast';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import type { RelistenStreamable } from '@/modules/relisten-audio-player';
import type { PlaybackQueueContext } from '@/relisten/player/playback_driver';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import type { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import { currentTrackIdentifier, PlaybackSource, progress } from '@/relisten/player/shared_state';
import { log } from '@/relisten/util/logging';
import { SonosPlaybackDriver } from './sonos_driver';
import type { SonosHandoffRequest } from './sonos_api';
import {
  HANDOFF_UNCONFIRMED_MESSAGE,
  handoffRequest,
  phoneMayResumeAfter,
  type SonosHandoffOutcome,
} from './sonos_handoff';
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
import { askWhereToPlay, type PlayDestination, playDestination } from './sonos_where_to_play';
import {
  controlledRoom,
  type RoomLeftBehind,
  type SonosEnding,
  sonosRoom,
  sonosRoomName,
  type SonosRoomState,
  type SonosRoomStore,
  stillMovingMessage,
} from './sonos_room_store';

const logger = log.extend('sonos-session');

const PROGRESS_INTERVAL_MS = 1000;
/**
 * How long moving to the phone waits for the room to pause and say where it
 * stopped, before the phone carries on from what it shows. A full command
 * confirmation can take longer, so a reachable but slow room falls back to
 * the phone's position.
 */
const TRANSFER_WAIT_MS = 3000;
/**
 * How long the network must stay gone before playback leaves the room
 * (`leaveRoomOffline`, called by the coordinator). A switch from Wi-Fi to
 * cellular can report no network for a moment, and leaving forgets the room,
 * which plays on.
 */
export const NETWORK_LOSS_GRACE_MS = 10_000;
/** How long to wait before asking the catalog again about a room's queue it couldn't build. */
const LOOKUP_RETRY_MS = 30_000;
/**
 * A room's order the phone can never show (a gone recording Sonos keeps as
 * played) is left alone until the room's order changes.
 */
const UNTIL_THE_QUEUE_CHANGES = Infinity;

/** Where the phone carries on: an occurrence of its queue and a position in it. */
interface PhonePlace {
  identifier: string | undefined;
  seconds: number;
}

/**
 * Why playback moves to the phone (`SonosSession.moveToPhone`), and what
 * each reason changes:
 * - `chosen`: the listener tapped This iPhone, or Cancel while connecting.
 *   Only this waits briefly for the room to say where it stopped.
 * - `offline`: the phone can't reach any room, so nothing is paused there,
 *   and the phone doesn't play while the room may still be playing.
 * - `playHere`: a Play went to the phone (`whereToPlay`), and `play`
 *   fulfils it once the room is left.
 */
type PhoneMove =
  | { reason: 'chosen' }
  | { reason: 'offline' }
  | { reason: 'playHere'; play: () => Promise<void> };

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
  /**
   * Whether the listener wants music playing, wherever it plays. Their Play,
   * Pause and tracks chosen to play set it at once (`transport`,
   * `playOccurrence`). Otherwise it follows the room's readings, so a pause
   * from another Sonos app counts too, except while one of their commands or
   * a handoff is on its way (`followListenerIntent`). A move to the phone
   * plays when it is set (`moveToPhone`). While the phone plays on its own,
   * nothing reads it.
   */
  private wantsMusic = false;
  /**
   * A move from the phone that ended unconfirmed (`moveQueueToRoom`), which
   * leaves the phone paused, and whether the listener wanted music then. A
   * network drop ends a handoff this way within seconds, before
   * `leaveRoomOffline` runs; that call then carries on with the phone
   * (`moveToPhone`). The listener's next Play or Pause clears it.
   */
  private unconfirmedMove: { wanted: boolean; endedAt: number } | undefined;
  private saving: Promise<boolean> | undefined;
  /** An edit arrived during a save; it goes out in one more save after it. */
  private saveAgain = false;
  private following: Promise<RoomQueueRead> | undefined;
  /** A save that may not have arrived is retried quietly; the user hears about it once. */
  private saveFailureShown = false;
  private previousRoom: SonosRoomState = { kind: 'none' };
  private progressTimer: ReturnType<typeof setInterval> | undefined;
  private buildRoomQueue: BuildRoomQueue | undefined;

  /** The question `whereToPlay` is waiting on, shared by Plays made meanwhile. */
  private choosing: Promise<PlayDestination> | undefined;

  constructor(
    private readonly player: RelistenPlayer,
    private readonly store: SonosRoomStore,
    private readonly ask: (roomName: string) => Promise<PlayDestination> = askWhereToPlay
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
    // The listener's own Play or Pause on the phone replaces a cut-off move's wish.
    const removeStateListener = this.player.onStateChanged.addListener(() => {
      this.unconfirmedMove = undefined;
    });
    this.onRoomChanged();

    return () => {
      unsubscribe();
      removeQueueListener();
      removeStateListener();
      this.buildRoomQueue = undefined;
      if (this.active) {
        // The room keeps playing; a session started again routes back to it.
        this.unrouteFromRoom();
      }
    };
  }

  // region Phone to room: the driver's commands

  /**
   * Moves the phone's queue to the room the listener chose in Play On.
   * Whatever plays now, the phone or another room, pauses at this choice. If
   * Sonos refuses before taking over, the phone plays again when the
   * listener wanted music; after any other outcome it stays paused, so the
   * queue never plays in two places. Cancelling is the listener choosing
   * the phone (`moveToPhone`).
   */
  async moveQueueToRoom(
    request: SonosHandoffRequest,
    groupName: string
  ): Promise<SonosHandoffOutcome> {
    const inFlight = this.store.getHandoffInFlight();
    if (inFlight) {
      // Refused before pausing anything, so nothing needs resuming.
      return { kind: 'refused', message: stillMovingMessage(inFlight.groupName), reconnect: false };
    }

    const wanted = this.player.state === RelistenPlaybackState.Playing;
    const fromPhone = this.store.getState().kind === 'none';
    // Pausing a room goes through `transport`, which clears `wantsMusic`. The
    // pause only makes way for the new room, so the listener's wish is put back.
    this.player.pause();
    this.wantsMusic = wanted;
    this.unconfirmedMove = undefined;

    const outcome = await this.store.handOff(request, groupName);
    // `wanted`, not `wantsMusic`: when the handoff ends, the store repeats the
    // reading of the room it left, paused by this move, and that reading
    // clears `wantsMusic` before this line runs.
    if (phoneMayResumeAfter(outcome) && wanted) {
      this.player.resume();
    }
    if (outcome.kind === 'uncertain' && fromPhone) {
      this.unconfirmedMove = { wanted, endedAt: Date.now() };
    }
    return outcome;
  }

  /**
   * Sends play, pause or seek, then shows the room as it is. Play may go to
   * the phone instead (`whereToPlay`).
   */
  async transport(transport: SonosTransport): Promise<void> {
    const play = transport.action === 'play';
    if (play || transport.action === 'pause') {
      this.wantsMusic = play;
      this.unconfirmedMove = undefined;
    }
    try {
      await this.whileCommanding(async () => {
        if (play && (await this.whereToPlay()) === 'phone') {
          await this.moveToPhone({
            reason: 'playHere',
            play: () => this.playOnPhone(this.phoneSelection(), true),
          });
          return;
        }
        await this.store.command(transport);
      });
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
   *
   * Play may go to the phone instead (`whereToPlay`); the phone's own driver
   * then plays `streamable` for the player's request. The question is asked
   * inside the command, so no read of the room replaces the queue the
   * listener just chose while they answer.
   */
  async playOccurrence(
    context: PlaybackQueueContext,
    streamable: RelistenStreamable
  ): Promise<void> {
    const target = context.orderedTracks[context.startIndex];
    if (!target) {
      return;
    }

    if (context.autoplay) {
      this.wantsMusic = true;
    }
    try {
      await this.whileCommanding(async () => {
        if (context.autoplay && (await this.whereToPlay()) === 'phone') {
          // The player's request is still open, so the phone's own driver fulfils it.
          await this.moveToPhone({
            reason: 'playHere',
            play: () => this.player.getNativePlaybackDriver().play(streamable, context),
          });
          return;
        }

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
      // the queue back to the room's track if it didn't follow. After a move to
      // the phone meanwhile, the phone's own play has replaced the request.
      if (this.active) {
        currentTrackIdentifier.setState(target.identifier);
        this.publishLatestRoom();
      }
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
      showToast(
        `The queue is still catching up with ${room.kind === 'none' ? 'Sonos' : sonosRoomName(room)}.`
      );
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
      showToast('Sonos keeps tracks once they’ve played.');
    }
  }

  /**
   * Replaces the room's queue with the phone's. If the room doesn't take it,
   * the phone's queue goes back to the room's. If playback moves to the phone
   * meanwhile, the handoff is cancelled and there is nothing more to do.
   */
  private async handOffPhoneQueue(
    room: SonosPlayback,
    target: PlayerQueueTrack,
    startTimeMs: number | undefined
  ) {
    const inFlight = this.store.getHandoffInFlight();
    if (inFlight) {
      // That handoff decides the room's queue; following the old room now would undo this choice.
      showToast(stillMovingMessage(inFlight.groupName));
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
    if (outcome.kind === 'playing' || outcome.kind === 'cancelled') {
      // Cancelled: playback moved to the phone (`transferToPhone`, `leaveRoomOffline`).
      return;
    }

    showToast(outcome.kind === 'refused' ? outcome.message : HANDOFF_UNCONFIRMED_MESSAGE, {
      tone: 'warning',
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

  // region Where a Play goes

  /**
   * Where the listener's Play goes while this phone controls a room
   * (`playDestination`), asking when that rule can't tell. Plays made while
   * the question is open share its answer.
   */
  private whereToPlay(): Promise<PlayDestination> {
    this.choosing ??= this.chooseWhereToPlay().finally(() => {
      this.choosing = undefined;
    });
    return this.choosing;
  }

  private async chooseWhereToPlay(): Promise<PlayDestination> {
    const room = this.store.getState();
    const roomName = sonosRoomName(room) ?? 'Sonos';
    const destination = playDestination({
      ...this.store.getContact(),
      roomPlaying: room.kind === 'active' && isSonosPlaying(room.playback),
      appActive: AppState.currentState === 'active',
      now: Date.now(),
    });

    switch (destination) {
      case 'room':
        return 'room';
      case 'phone':
        showToast(`${roomName} can’t be reached, so this is playing on your phone.`, {
          tone: 'warning',
        });
        return 'phone';
      case 'ask': {
        const chosen = await this.ask(roomName);
        if (chosen === 'room') {
          this.store.noteChosen();
        }
        return chosen;
      }
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

    this.followListenerIntent(room.playback);
    if (room.commandError && room.commandError !== commandErrorOf(previous)) {
      showToast(room.commandError, { tone: 'warning' });
    }
    this.publishRoom(room.playback);
    this.reconcileQueue(room.playback);
  };

  /**
   * With nothing of the listener's on its way to a room, what the room does
   * is what they chose, here or in another Sonos app. While a command or a
   * handoff is in flight, the room still shows the state before it: a
   * handoff pauses the room it leaves, which isn't a choice to stop
   * listening.
   */
  private followListenerIntent(playback: SonosPlayback) {
    if (this.commandsInFlight === 0 && !this.store.getHandoffInFlight()) {
      this.wantsMusic = isSonosPlaying(playback);
    }
  }

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
      showToast(
        ended.reason === 'reconnect'
          ? `Connect Sonos again to control ${ended.roomName}.`
          : `${ended.roomName} is no longer playing your queue.`
      );
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
      showToast('Your queue change was replaced by one from another device.', { tone: 'warning' });
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
      showToast('The room’s queue has a track that’s no longer available, so it can’t be shown.', {
        tone: 'warning',
      });
      return 'notTaken';
    }

    const kept = queue.entries.filter((entry) => !gone.has(entry.occurrenceId));
    const saved = await this.store.saveQueue(kept, queue.version);
    if (saved.kind !== 'saved') {
      this.waitBeforeFollowing(handle, queue, LOOKUP_RETRY_MS);
      return 'notTaken';
    }
    showToast(
      gone.size === 1
        ? 'Removed a track that’s no longer available.'
        : `Removed ${gone.size} tracks that are no longer available.`
    );
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
    showToast(message, { tone: 'warning' });
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
        this.moveRoomPlayedToFront();
        continue;
      }
      return outcome.kind === 'trackMoved' ? { kind: 'notSaved' } : outcome;
    }
  }

  /** Puts the room's tracks through its playing one first in the phone's order, as in the room's. */
  private moveRoomPlayedToFront() {
    const room = this.store.getState();
    const agreed = room.kind === 'active' ? this.agreedFor(room.playback.handle) : undefined;
    const playingIndex = agreed?.occurrenceIds.indexOf(this.roomOccurrenceId() ?? '') ?? -1;
    if (!agreed || playingIndex < 0) {
      return;
    }
    this.publishLatestRoom();
    this.player.queue.movePlayedToFront(agreed.occurrenceIds.slice(0, playingIndex + 1));
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
          showToast('Couldn’t update the Sonos queue yet.', { tone: 'warning' });
        }
        return { kind: 'notSaved' };
    }
  }

  // endregion

  // region Room back to the phone
  //
  // Playback leaves a room for the phone in two ways:
  // - `moveToPhone`: this device chose the phone, for one of the reasons in
  //   `PhoneMove`.
  // - `returnToPhone`: the room stopped playing this queue underneath the phone.
  // Whether the phone then plays follows `wantsMusic`.

  /**
   * The listener chose this phone: This iPhone in Play On, or Cancel while
   * the queue moves to a room. It never depends on reaching the room: the
   * listener may be out of its reach, in a garage, and the phone must still
   * play.
   */
  transferToPhone(): Promise<void> {
    return this.moveToPhone({ reason: 'chosen' });
  }

  /** The phone can't reach any room: no network, or offline mode. */
  leaveRoomOffline(): Promise<void> {
    return this.moveToPhone({ reason: 'offline' });
  }

  /**
   * Moves playback from the room, or from a handoff on its way to one, to
   * the phone:
   * 1. A handoff in flight is abandoned; if it lands anyway, the store pauses
   *    the room (`abandonHandoff`).
   * 2. When the phone and the room share a queue, the room may get a few
   *    seconds to pause and say where it stopped (`whereRoomStopped`).
   * 3. The player stops following the room, which is paused in the
   *    background unless it already answered (`leaveRoom`).
   * 4. The phone carries on from where the room stopped, or else from the
   *    track and position it shows, playing if the listener wants music.
   *    Offline, a room that was playing may still be, and the phone can't
   *    stop it, so the phone waits rather than play in a second place.
   *    A move from the phone that the drop cut off is the exception: the
   *    phone plays even though the room may have taken the queue (Alec,
   *    2026-11-26), and the toast says the queue stayed here.
   */
  private async moveToPhone(move: PhoneMove): Promise<void> {
    const offline = move.reason === 'offline';
    const room = this.store.getState();
    const handoff = this.store.getHandoffInFlight();
    const cutOff = offline ? this.moveCutOffByDrop() : undefined;
    this.unconfirmedMove = undefined;
    // Read before abandoning the handoff, whose end repeats the paused reading of the room it left.
    const play = cutOff ? cutOff.wanted : this.wantsMusic && !(offline && mayStillPlay(room));

    this.abandonHandoff();
    if (room.kind === 'none') {
      // No room to leave. Either a move from this phone was on its way or was
      // cut off (`moveQueueToRoom` paused the phone), or the room ended while
      // the listener was asked where to play and `returnToPhone` stopped the phone.
      if (handoff || cutOff) {
        if (offline) {
          showToast('You’re offline, so your queue stayed on this phone.', { tone: 'warning' });
        }
        if (play) {
          this.player.resume();
        }
      }
      return;
    }

    const stoppedAt =
      move.reason === 'chosen' && !handoff ? await this.whereRoomStopped(room) : undefined;
    if (!this.active) {
      // The room ended meanwhile; the queue is already back on the phone, and the user was told.
      return;
    }

    this.leaveRoom({ pauseInBackground: !offline && stoppedAt === undefined });
    if (offline) {
      const roomName = sonosRoomName(room) ?? 'Sonos';
      showToast(`You’re offline, so playback moved from ${roomName} to this phone.`, {
        tone: 'warning',
      });
    }
    if (move.reason === 'playHere') {
      await move.play();
      return;
    }
    await this.playOnPhone(stoppedAt ?? this.phoneSelection(), play);
  }

  /**
   * The unconfirmed move from the phone that the network drop caused, if
   * any. The coordinator leaves the room `NETWORK_LOSS_GRACE_MS` after the
   * network goes, and the drop came before the handoff's failures, so a move
   * that ended more than that long ago failed for some other reason.
   */
  private moveCutOffByDrop(): { wanted: boolean } | undefined {
    const move = this.unconfirmedMove;
    return move && Date.now() - move.endedAt <= NETWORK_LOSS_GRACE_MS ? move : undefined;
  }

  /**
   * Gives a room that shares the phone's queue `TRANSFER_WAIT_MS` to pause
   * and say where it stopped. Undefined when the queues differ or the room
   * doesn't answer in time. A pause that loses the race runs on, but can no
   * longer touch the phone: once `leaveRoom` unroutes, its reads of the room
   * stop at `stillFollowing`.
   */
  private async whereRoomStopped(room: SonosRoomState): Promise<PhonePlace | undefined> {
    if (room.kind !== 'active' || !this.phoneHas(room.playback.occurrence?.occurrenceId)) {
      return undefined;
    }
    return Promise.race([
      this.whileCommanding(() => this.pauseRoomForTransfer(isSonosPlaying(room.playback))),
      wait(TRANSFER_WAIT_MS).then(() => undefined),
    ]);
  }

  /**
   * Stops controlling the room and routes the player back to the phone. With
   * `pauseInBackground`, a room that may still be playing is paused without
   * the phone waiting for it.
   */
  private leaveRoom({ pauseInBackground }: { pauseInBackground: boolean }) {
    const room = this.store.getState();
    const left = controlledRoom(room);

    // Unrouted before the release, so the store's `none` doesn't also stop the phone.
    this.unrouteFromRoom();
    this.store.release();
    if (pauseInBackground && mayStillPlay(room) && left) {
      this.warnIfStillPlaying(
        this.store.pauseRoomLeftBehind(left.handle, left.groupId),
        sonosRoomName(room)
      );
    }
  }

  /**
   * Abandons a handoff on its way to a room. The handoff may still land; the
   * store then pauses the room, and the listener hears if that fails.
   */
  private abandonHandoff() {
    const handoff = this.store.getHandoffInFlight();
    const left = this.store.abandonHandoff();
    if (handoff && left) {
      this.warnIfStillPlaying(left, handoff.groupName);
    }
  }

  /** Tells the listener when a room this phone left may still be playing. */
  private warnIfStillPlaying(left: Promise<RoomLeftBehind>, roomName: string | undefined) {
    void left.then((outcome) => {
      if (outcome === 'mayStillPlay') {
        showToast(`Couldn’t pause ${roomName ?? 'Sonos'}. It may still be playing.`, {
          tone: 'warning',
        });
      }
    });
  }

  /** The track and position the player shows, including one it is still starting. */
  private phoneSelection(): PhonePlace {
    return {
      identifier: this.player.shownTrackIdentifier,
      seconds: progress.lastState()?.elapsed ?? 0,
    };
  }

  /** Plays `start` on the phone, or leaves it selected at its position for the next Play. */
  private async playOnPhone(start: PhonePlace, play: boolean) {
    const tracks = this.player.queue.orderedTracks;
    const found = tracks.findIndex((track) => track.identifier === start.identifier);
    const index = found >= 0 ? found : (this.player.queue.currentIndex ?? 0);
    const track = tracks[index];

    await this.player.stop();
    if (!track) {
      return;
    }
    const seconds = found >= 0 ? start.seconds : 0;
    if (play) {
      this.player.playTrackAtIndex(index, seconds);
    } else {
      // A stopped player keeps the selected track and position for the next Play.
      currentTrackIdentifier.setState(track.identifier);
      void this.player.seekToTime(seconds);
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

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Whether a room may be playing: it was last read playing, or hasn't been read yet. */
function mayStillPlay(room: SonosRoomState): boolean {
  return room.kind === 'checking' || (room.kind === 'active' && isSonosPlaying(room.playback));
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function commandErrorOf(room: SonosRoomState): string | undefined {
  return room.kind === 'active' ? room.commandError : undefined;
}

export const sonosSession = new SonosSession(RelistenPlayer.DEFAULT_INSTANCE, sonosRoom);
