import { useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import { isSonosUnavailable, needsSonosReconnect, type SonosHandoffRequest } from './sonos_api';
import { runSonosHandoff, type SonosHandoffOutcome } from './sonos_handoff';
import {
  isSonosPlaybackLive,
  reachedTransport,
  type SonosPlayback,
  type SonosQueue,
  type SonosQueueEntry,
  type SonosTransport,
  type SonosTransportAction,
  type SonosVolume,
  transportBody,
} from './sonos_playback';
import {
  fetchSonosPlayback,
  fetchSonosQueue,
  fetchSonosVolume,
  saveSonosQueue,
  sendSonosCommand,
} from './sonos_playback_api';
import { asyncStorageRoomMemory, type SonosRoomMemory } from './sonos_room_memory';

/** Why this device stopped controlling a room it didn't let go of itself. */
export interface SonosEnding {
  roomName: string;
  /** `reconnect`: the account's Sonos link must be made again. `stopped`: anything else. */
  reason: 'stopped' | 'reconnect';
}

/**
 * The Sonos playback this device is controlling, if any.
 *
 * - `none`: the phone plays. `ended` says why a room's playback ended
 *   underneath this device (another app took over, the handle expired, or the
 *   Sonos link lapsed).
 * - `checking`: a handle is known but the room hasn't been read yet, or it
 *   couldn't confirm its current item; controls wait.
 * - `active`: the last room state read, plus a command waiting for the room
 *   to show it (`pending`) or one that didn't take (`commandError`), and the
 *   group's volume: the last level read for that group until the room answers.
 */
export type SonosRoomState =
  | { kind: 'none'; ended?: SonosEnding }
  | { kind: 'checking'; handle: string; groupName: string; pending?: SonosTransportAction }
  | {
      kind: 'active';
      playback: SonosPlayback;
      pending?: SonosTransportAction;
      commandError?: string;
      volume?: SonosVolume;
    };

type ActiveRoom = Extract<SonosRoomState, { kind: 'active' }>;

/**
 * How a queue edit ended:
 * - `saved`: the room has the order, as of `version`.
 * - `trackMoved`: the room moved to another track since it was last read;
 *   read it and the same order can be sent again.
 * - `refused`: the room keeps its order (another device's edit won, or the
 *   edit changed the tracks through the playing one).
 * - `failed`: the edit may not have arrived; nothing is known to have changed.
 */
export type SonosQueueSave =
  | { kind: 'saved'; version: number }
  | { kind: 'trackMoved' }
  | { kind: 'refused'; message: string }
  | { kind: 'failed' };

/** A handoff this device started and hasn't finished. */
export interface SonosHandoffInFlight {
  groupId: string;
  groupName: string;
}

/**
 * What a command's send established: Sonos took it, it was refused, or the
 * response was lost twice and only the room can say whether it arrived.
 */
type SendResult = { kind: 'accepted' } | { kind: 'unknown' } | { kind: 'refused'; message: string };

/** The account a request was sent for; `stillCurrent` turns false when it changes. */
interface AccountScope {
  api: AuthorizedAccountsApiClient;
  stillCurrent(): boolean;
}

/** The account and handle a request was sent for; `stillCurrent` also checks the handle. */
interface RoomScope extends AccountScope {
  handle: string;
}

type Subscriber = () => void;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SonosRoomTiming {
  wait: (ms: number) => Promise<void>;
  confirmIntervalMs: number;
  confirmAttempts: number;
}

/**
 * Holds the room this device controls and keeps its state fresh. One handle
 * at a time: adopting a new one (a later handoff) replaces the old, and a
 * response that arrives for a replaced handle is dropped.
 *
 * Only the server knows the room's state. Every request is bound to the
 * account and handle that started it (`RoomScope`) and dropped after either
 * changes. The room is read one request at a time, so readings arrive in
 * order; a reading sent before this device's own queue save still carries
 * the older queue version, so the version shown never goes back.
 */
export class SonosRoomStore {
  private isCurrentScope: () => boolean = () => true;
  private state: SonosRoomState = { kind: 'none' };
  private handoffInFlight: SonosHandoffInFlight | undefined;
  /** The order the last handoff sent, by the handle it returned, until the session takes it. */
  private handedOff: { handle: string; occurrenceIds: readonly string[] } | undefined;
  /** The read of the current handle in flight; polls and confirmations share it. */
  private reading: { handle: string; playback: Promise<SonosPlayback | undefined> } | undefined;
  /** Each group's last volume this run, shown while the room is read again. */
  private readonly volumes = new Map<string, SonosVolume>();
  private readonly subscribers = new Set<Subscriber>();
  private api: AuthorizedAccountsApiClient | undefined;
  private account: string | undefined;

  constructor(
    private readonly timing: SonosRoomTiming = {
      wait,
      confirmIntervalMs: 750,
      confirmAttempts: 8,
    },
    private readonly rooms: SonosRoomMemory = asyncStorageRoomMemory
  ) {}

  subscribe = (subscriber: Subscriber) => {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  };

  getState = () => this.state;

  getHandoffInFlight = () => this.handoffInFlight;

  /**
   * The signed-in account's client, or undefined when signed out. Any change
   * of account ends remote control: the room keeps playing, and the phone
   * returns to its own queue.
   */
  bind(
    api: AuthorizedAccountsApiClient | undefined,
    isCurrentScope: () => boolean,
    account: string | undefined
  ) {
    if (api === this.api && isCurrentScope === this.isCurrentScope && account === this.account) {
      return;
    }
    this.api = api;
    this.isCurrentScope = isCurrentScope;
    this.account = account;
    this.handedOff = undefined;
    this.reading = undefined;
    this.set({ kind: 'none' });
  }

  /** Takes over the handle a handoff just returned, remembers the room, and reads it. */
  adopt(handle: string, groupName: string) {
    this.set({ kind: 'checking', handle, groupName });
    this.remember(handle);
    void this.refresh();
  }

  /**
   * Moves `request`'s queue to its room and, once the room takes it, controls
   * that room. One handoff runs at a time: a second, chosen while the first is
   * still settling, is refused before anything is sent, so the queue never
   * ends up playing in two rooms.
   */
  async handOff(request: SonosHandoffRequest, groupName: string): Promise<SonosHandoffOutcome> {
    const scope = this.accountScope();
    if (!scope) {
      return { kind: 'uncertain', reconnect: false };
    }
    if (this.handoffInFlight) {
      return {
        kind: 'refused',
        message: `Your queue is still moving to ${this.handoffInFlight.groupName}.`,
        reconnect: false,
      };
    }

    this.handoffInFlight = { groupId: request.group_id, groupName };
    this.notify();
    try {
      const outcome = await runSonosHandoff(scope.api, request, scope.stillCurrent, {
        wait: this.timing.wait,
      });
      // The runner reports a handoff that settled after the account changed as uncertain.
      if (outcome.kind === 'playing') {
        // Recorded before adopting: adopting routes the player at once, and the
        // session's first read of the new room compares against this order.
        this.handedOff = {
          handle: outcome.handle,
          occurrenceIds: request.occurrences.map((occurrence) => occurrence.occurrence_id),
        };
        this.adopt(outcome.handle, groupName);
      }
      return outcome;
    } finally {
      this.handoffInFlight = undefined;
      this.notify();
    }
  }

  /**
   * The order this device handed to `handle`, if it started that handle and
   * no one has taken it yet. It is handed over once, to the session's first
   * read of the room, so an old handoff never stands in for a later order.
   */
  takeHandedOffOrder(handle: string): readonly string[] | undefined {
    if (this.handedOff?.handle !== handle) {
      return undefined;
    }
    const { occurrenceIds } = this.handedOff;
    this.handedOff = undefined;
    return occurrenceIds;
  }

  /**
   * On launch or when the app returns: re-reads the room this device was
   * controlling, or restores the room it chose before the app closed when
   * `canRestore` allows (nothing else is playing). Another device's rooms
   * are never taken over here. Reading state never sends a command.
   */
  async discover(canRestore: () => boolean) {
    if (this.handoffInFlight) {
      // The handoff decides the room; an older remembered one mustn't win meanwhile.
      return;
    }
    if (this.currentHandle() !== undefined) {
      await this.refresh();
      return;
    }

    const scope = this.accountScope();
    const account = this.account;
    if (!scope || !account) {
      return;
    }
    const handle = await this.rooms.load(account).catch(() => undefined);
    if (!handle || !canRestore()) {
      return;
    }

    try {
      const playback = await fetchSonosPlayback(scope.api, handle);
      if (!scope.stillCurrent() || this.currentHandle() !== undefined) {
        return;
      }
      if (!isSonosPlaybackLive(playback)) {
        this.remember(undefined);
      } else if (canRestore()) {
        this.apply(playback);
      }
      // A live room that can't be restored now (the phone started playing
      // meanwhile) stays remembered for the next launch.
    } catch (error) {
      if (isSonosUnavailable(error)) {
        this.remember(undefined);
      }
    }
  }

  /**
   * Re-reads the room for the current handle, sharing a read already in
   * flight, and resolves the reading now shown.
   */
  refresh(): Promise<SonosPlayback | undefined> {
    const room = this.roomScope();
    if (!room) {
      return Promise.resolve(undefined);
    }
    if (this.reading?.handle === room.handle) {
      return this.reading.playback;
    }

    const playback = this.read(room).finally(() => {
      if (this.reading?.playback === playback) {
        this.reading = undefined;
      }
    });
    this.reading = { handle: room.handle, playback };
    return playback;
  }

  private async read(room: RoomScope): Promise<SonosPlayback | undefined> {
    try {
      const playback = await fetchSonosPlayback(room.api, room.handle);
      return room.stillCurrent() ? this.apply(playback) : undefined;
    } catch (error) {
      const gone = isSonosUnavailable(error) || needsSonosReconnect(error);
      if (gone && room.stillCurrent()) {
        this.endPlayback({
          roomName: this.roomName() ?? 'Sonos',
          reason: needsSonosReconnect(error) ? 'reconnect' : 'stopped',
        });
      }
      return undefined;
    }
  }

  /** Stops controlling the room without changing it, as when playback moves back to the phone. */
  release() {
    this.endPlayback(undefined);
  }

  /**
   * Sends a transport command for the current occurrence, then reads the room
   * until it shows the result. Resolves true once the room shows it. A lost
   * response may still have reached Sonos, so it is retried once with the
   * same command ID and body (the server reconciles rather than repeats it).
   * If that is lost too, the room is read the same way before the user is
   * offered a retry. One command runs at a time; one sent while another is
   * pending is dropped.
   */
  async command(transport: SonosTransport): Promise<boolean> {
    const room = this.roomScope();
    const current = this.state;
    if (!room || current.kind !== 'active' || current.pending) {
      return false;
    }
    const itemId = current.playback.occurrence?.itemId;
    if (!itemId) {
      return false;
    }
    if (
      transport.action === 'skip' &&
      current.playback.occurrence?.occurrenceId === transport.occurrenceId
    ) {
      // Already on that occurrence; the server would only confirm it.
      return true;
    }

    const body = transportBody(transport, randomUUID(), {
      itemId,
      queueVersion: current.playback.queueVersion,
    });
    this.set({ ...current, pending: transport.action, commandError: undefined });

    const sent = await this.send(room, body);
    if (sent.kind === 'refused') {
      await this.refresh();
      this.finishCommand(room.handle, sent.message);
      return false;
    }
    return this.confirmTransport(room, transport, itemId);
  }

  /** Reads the room until it shows `transport`, or gives up and offers a retry. */
  private async confirmTransport(
    room: RoomScope,
    transport: SonosTransport,
    itemId: string
  ): Promise<boolean> {
    for (let attempt = 0; attempt < this.timing.confirmAttempts; attempt += 1) {
      await this.timing.wait(this.timing.confirmIntervalMs);
      if (!room.stillCurrent()) {
        return false;
      }
      const latest = await this.refresh();
      if (!room.stillCurrent()) {
        return false;
      }
      if (latest && reachedTransport(latest, transport, itemId)) {
        this.finishCommand(room.handle);
        return true;
      }
    }

    this.finishCommand(room.handle, 'Sonos didn’t confirm. Try again.');
    return false;
  }

  /** Reads the room's queue, or undefined when it can't be read now. */
  async readQueue(): Promise<{ handle: string; queue: SonosQueue } | undefined> {
    const room = this.roomScope();
    if (!room) {
      return undefined;
    }
    try {
      const queue = await fetchSonosQueue(room.api, room.handle);
      return room.stillCurrent() ? { handle: room.handle, queue } : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Replaces the room's queue with `entries`, which must keep everything
   * through the playing occurrence. A lost response is retried once with the
   * same command ID, which the server answers with the original result.
   */
  async saveQueue(
    entries: readonly SonosQueueEntry[],
    expectedVersion: number
  ): Promise<SonosQueueSave> {
    const room = this.roomScope();
    const current = this.state;
    const itemId = current.kind === 'active' ? current.playback.occurrence?.itemId : undefined;
    if (!room || !itemId) {
      return { kind: 'failed' };
    }
    const edit = { commandId: randomUUID(), expectedVersion, expectedItemId: itemId, entries };

    try {
      const version = await this.retryIfLost(room, () =>
        saveSonosQueue(room.api, room.handle, edit)
      );
      if (room.stillCurrent()) {
        this.recordQueueVersion(room.handle, version);
      }
      return { kind: 'saved', version };
    } catch (error) {
      if (!(error instanceof AccountsApiError)) {
        return { kind: 'failed' };
      }
      if (error.code === 'sonos_playback_changed') {
        return { kind: 'trackMoved' };
      }
      if (error.status === 409 || error.status === 422) {
        return { kind: 'refused', message: queueRefusal(error.code) };
      }
      return { kind: 'failed' };
    }
  }

  /**
   * A saved edit's version becomes the room's, so the next skip names it.
   * The server refuses a skip chosen from any other version.
   */
  private recordQueueVersion(handle: string, version: number) {
    const current = this.state;
    if (current.kind === 'active' && current.playback.handle === handle) {
      this.set({ ...current, playback: { ...current.playback, queueVersion: version } });
    }
  }

  /** Reads the group's volume for the controls. */
  async refreshVolume() {
    const room = this.roomScope();
    if (!room) {
      return;
    }
    try {
      const volume = await fetchSonosVolume(room.api, room.handle);
      const current = this.state;
      if (room.stillCurrent() && current.kind === 'active') {
        this.showVolume(current, volume);
      }
    } catch {
      // The controls keep the last volume they read.
    }
  }

  /**
   * Sets the group's volume (0 to 100) or mute. These apply to the whole
   * group, whatever it is playing, so the controls send only the final value
   * and then read the volume back. A refusal is shown without disturbing a
   * transport command that is still confirming.
   */
  async setVolume(change: { volume: number } | { muted: boolean }) {
    const room = this.roomScope();
    const current = this.state;
    if (!room || current.kind !== 'active' || current.volume?.fixed) {
      return;
    }
    // Moving the volume of a muted room unmutes it, as the Sonos app does.
    const unmutes = 'volume' in change && current.volume?.muted === true;
    const bodies =
      'volume' in change
        ? [
            { action: 'volume', command_id: randomUUID(), volume: Math.round(change.volume) },
            ...(unmutes ? [{ action: 'mute', command_id: randomUUID(), muted: false }] : []),
          ]
        : [{ action: 'mute', command_id: randomUUID(), muted: change.muted }];
    if (current.volume) {
      this.showVolume(current, { ...current.volume, ...change, ...(unmutes && { muted: false }) });
    }

    for (const body of bodies) {
      const sent = await this.send(room, body);
      const latest = this.state;
      if (sent.kind === 'refused' && room.stillCurrent() && latest.kind === 'active') {
        this.set({ ...latest, commandError: sent.message });
        break;
      }
    }
    await this.refreshVolume();
  }

  /** Sends a command body, retrying a lost response once with the same body. */
  private async send(room: RoomScope, body: Record<string, unknown>): Promise<SendResult> {
    try {
      await this.retryIfLost(room, () => sendSonosCommand(room.api, room.handle, body));
      return { kind: 'accepted' };
    } catch (error) {
      if (!(error instanceof AccountsApiError)) {
        return { kind: 'refused', message: 'Sonos didn’t take that. Try again.' };
      }
      return error.retryable
        ? { kind: 'unknown' }
        : { kind: 'refused', message: commandRefusal(error.code) };
    }
  }

  /**
   * Runs `request`, and once more if its response was lost while the request
   * is still current. The caller passes the same body, with the same command
   * ID, so the server treats both as one.
   */
  private async retryIfLost<T>(scope: AccountScope, request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof AccountsApiError && error.retryable && scope.stillCurrent()) {
        return request();
      }
      throw error;
    }
  }

  private finishCommand(handle: string, commandError?: string) {
    const current = this.state;
    if (current.kind === 'active' && current.playback.handle === handle) {
      this.set({
        kind: 'active',
        playback: current.playback,
        commandError,
        volume: current.volume,
      });
    } else if (current.kind === 'checking' && current.handle === handle && current.pending) {
      this.set({ ...current, pending: undefined });
    }
  }

  /** Shows a reading of the current handle, and resolves the reading now shown. */
  private apply(playback: SonosPlayback): SonosPlayback | undefined {
    if (!isSonosPlaybackLive(playback)) {
      this.endPlayback({
        roomName: playback.groupName,
        reason: playback.status === 'revoked' ? 'reconnect' : 'stopped',
      });
      return undefined;
    }

    const current = this.state;
    const pending = current.kind === 'none' ? undefined : current.pending;
    if (playback.status === 'unconfirmed' || !playback.occurrence) {
      this.set({
        kind: 'checking',
        handle: playback.handle,
        groupName: playback.groupName,
        pending,
      });
      return undefined;
    }

    if (current.kind !== 'active' || current.playback.handle !== playback.handle) {
      const volume = this.volumes.get(playback.groupId);
      this.set({ kind: 'active', playback, pending, volume });
      return playback;
    }
    return this.applyNewerReading(current, playback);
  }

  /**
   * A new reading of the room already shown. A queue version recorded from
   * this device's own save is kept until the room reports it, since a poll
   * sent before the save answers with the version before it. Every reading
   * is published, even an unchanged one: the session retries a failed save
   * or read when the room is next read.
   */
  private applyNewerReading(current: ActiveRoom, reading: SonosPlayback): SonosPlayback {
    const shownVersion = current.playback.queueVersion;
    const playback =
      shownVersion !== null && (reading.queueVersion ?? -1) < shownVersion
        ? { ...reading, queueVersion: shownVersion }
        : reading;
    this.set({ ...current, playback });
    return playback;
  }

  private showVolume(current: ActiveRoom, volume: SonosVolume) {
    this.volumes.set(current.playback.groupId, volume);
    this.set({ ...current, volume });
  }

  /** The handle no longer plays this device's queue; the device forgets the room. */
  private endPlayback(ended: SonosEnding | undefined) {
    this.remember(undefined);
    this.reading = undefined;
    this.set(ended === undefined ? { kind: 'none' } : { kind: 'none', ended });
  }

  private remember(handle: string | undefined) {
    if (this.account) {
      void this.rooms.save(this.account, handle).catch(() => {});
    }
  }

  private accountScope(): AccountScope | undefined {
    const api = this.api;
    const isCurrentScope = this.isCurrentScope;
    if (!api || !isCurrentScope()) {
      return undefined;
    }
    return { api, stillCurrent: () => api === this.api && isCurrentScope() };
  }

  private roomScope(): RoomScope | undefined {
    const scope = this.accountScope();
    const handle = this.currentHandle();
    if (!scope || handle === undefined) {
      return undefined;
    }
    return {
      api: scope.api,
      handle,
      stillCurrent: () => scope.stillCurrent() && handle === this.currentHandle(),
    };
  }

  private roomName(): string | undefined {
    return sonosRoomName(this.state);
  }

  private currentHandle(): string | undefined {
    const current = this.state;
    return current.kind === 'active'
      ? current.playback.handle
      : current.kind === 'checking'
        ? current.handle
        : undefined;
  }

  private set(next: SonosRoomState) {
    this.state = next;
    this.notify();
  }

  private notify() {
    this.subscribers.forEach((subscriber) => subscriber());
  }
}

/** The name of the room this device controls, if any. */
export function sonosRoomName(state: SonosRoomState): string | undefined {
  return state.kind === 'active'
    ? state.playback.groupName
    : state.kind === 'checking'
      ? state.groupName
      : undefined;
}

/** What to tell the user when Sonos refuses a command, by the server's code. */
function commandRefusal(code: string | null): string {
  switch (code) {
    case 'sonos_playback_inactive':
      return 'The room is playing something else.';
    case 'sonos_playback_changed':
      return 'The track changed. Try again.';
    case 'sonos_command_unavailable':
      return 'That isn’t available for this track.';
    case 'sonos_command_superseded':
      return 'Another change took over.';
    case 'sonos_volume_fixed':
      return 'This room’s volume is fixed.';
    case 'sonos_reconnect_required':
      return 'Connect Sonos again to control this room.';
    default:
      return 'Sonos didn’t take that. Try again.';
  }
}

/** What to tell the user when the room keeps its queue, by the server's code. */
function queueRefusal(code: string | null): string {
  switch (code) {
    case 'sonos_queue_current_protected':
      return 'Sonos keeps the tracks through the one playing.';
    case 'sonos_queue_history_full':
      return 'This room’s queue can’t take more changes. Play on Sonos again to start fresh.';
    case 'sonos_queue_changed':
      return 'The queue changed on another device.';
    default:
      return 'Sonos didn’t take that queue change.';
  }
}

export const sonosRoom = new SonosRoomStore();

export function useSonosRoom(): SonosRoomState {
  return useSyncExternalStore(sonosRoom.subscribe, sonosRoom.getState, sonosRoom.getState);
}

const roomNameSnapshot = () => sonosRoomName(sonosRoom.getState());

/**
 * The name of the room this device controls. Reading only the name, rather
 * than the whole state, spares a re-render on every poll.
 */
export function useSonosRoomName(): string | undefined {
  return useSyncExternalStore(sonosRoom.subscribe, roomNameSnapshot, roomNameSnapshot);
}

/** The handoff in flight from this device, so a second room can't be chosen meanwhile. */
export function useSonosHandoffInFlight(): SonosHandoffInFlight | undefined {
  return useSyncExternalStore(
    sonosRoom.subscribe,
    sonosRoom.getHandoffInFlight,
    sonosRoom.getHandoffInFlight
  );
}
