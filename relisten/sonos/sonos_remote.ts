import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import type { SonosHandoffRequest } from './sonos_api';
import { runSonosHandoff, type SonosHandoffOutcome } from './sonos_handoff';
import {
  fetchSonosPlayback,
  fetchSonosQueue,
  fetchSonosVolume,
  isSonosPlaybackLive,
  reachedTransport,
  saveSonosQueue,
  sendSonosCommand,
  type SonosPlayback,
  type SonosQueue,
  type SonosQueueEntry,
  type SonosTransport,
  type SonosTransportAction,
  type SonosVolume,
  transportBody,
} from './sonos_playback';

/**
 * The Sonos playback this device is controlling, if any.
 *
 * - `none`: the phone plays. `endedRoom` names a room whose playback ended
 *   underneath this device (another app took over, or the handle expired).
 * - `checking`: a handle is known but the room hasn't been read yet, or it
 *   couldn't confirm its current item; controls wait.
 * - `active`: the last room state read, plus a command waiting for the room
 *   to show it (`pending`) or one that didn't take (`commandError`), and the
 *   group's volume: the last level read for that group until the room answers.
 */
export type SonosRemoteState =
  | { kind: 'none'; endedRoom?: string }
  | { kind: 'checking'; handle: string; groupName: string; pending?: SonosTransportAction }
  | {
      kind: 'active';
      playback: SonosPlayback;
      pending?: SonosTransportAction;
      commandError?: string;
      volume?: SonosVolume;
    };

/**
 * How a queue edit ended:
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

type Listener = () => void;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const currentScope = () => true;

export interface SonosRemoteTiming {
  wait: (ms: number) => Promise<void>;
  confirmIntervalMs: number;
  confirmAttempts: number;
}

/** Where this device remembers the room it chose, per account, across launches. */
export interface SonosRoomMemory {
  load(account: string): Promise<string | undefined>;
  save(account: string, handle: string | undefined): Promise<void>;
}

const roomKey = (account: string) => `relisten.sonos.room.${account}`;

const asyncStorageRoomMemory: SonosRoomMemory = {
  load: async (account) => (await AsyncStorage.getItem(roomKey(account))) ?? undefined,
  save: (account, handle) =>
    handle === undefined
      ? AsyncStorage.removeItem(roomKey(account))
      : AsyncStorage.setItem(roomKey(account), handle),
};

/**
 * Holds the room this device controls and keeps its state fresh. One handle
 * at a time: adopting a new one (a later handoff) replaces the old, and a
 * response that arrives for a replaced handle is dropped.
 *
 * Only the server knows the room's state. Every request is bound to the
 * account that started it and dropped after an account change.
 */
export class SonosRemoteStore {
  private isCurrentScope = currentScope;
  private state: SonosRemoteState = { kind: 'none' };
  /** Each group's last volume this run, shown while the room is read again. */
  private readonly volumes = new Map<string, SonosVolume>();
  private readonly listeners = new Set<Listener>();
  private api: AuthorizedAccountsApiClient | undefined;
  private account: string | undefined;

  constructor(
    private readonly timing: SonosRemoteTiming = {
      wait,
      confirmIntervalMs: 750,
      confirmAttempts: 8,
    },
    private readonly rooms: SonosRoomMemory = asyncStorageRoomMemory
  ) {}

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  /** The signed-in account's client, or undefined when signed out, which ends remote control. */
  bind(
    api: AuthorizedAccountsApiClient | undefined,
    isCurrentScope = currentScope,
    account?: string
  ) {
    if (api === this.api && isCurrentScope === this.isCurrentScope && account === this.account) {
      return;
    }
    this.api = api;
    this.isCurrentScope = isCurrentScope;
    this.account = account;
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
   * that room. Retries and polls stay bound to the account that started it.
   */
  async handOff(request: SonosHandoffRequest, groupName: string): Promise<SonosHandoffOutcome> {
    const api = this.api;
    const isCurrent = this.isCurrentScope;
    if (!api || !isCurrent()) {
      return { kind: 'uncertain' };
    }

    const outcome = await runSonosHandoff(api, request, {
      wait: this.timing.wait,
      isCurrent: () => api === this.api && isCurrent(),
    });
    if (outcome.kind === 'playing' && outcome.receipt.playbackHandle && api === this.api) {
      this.adopt(outcome.receipt.playbackHandle, groupName);
    }
    return outcome;
  }

  /**
   * On launch or when the app returns: re-reads the room this device was
   * controlling, or restores the room it chose before the app closed when
   * `canRestore` allows (nothing else is playing). Another device's rooms
   * are never taken over here. Reading state never sends a command.
   */
  async discover(canRestore: () => boolean) {
    if (this.currentHandle() !== undefined) {
      await this.refresh();
      return;
    }

    const api = this.api;
    const account = this.account;
    const isCurrent = this.isCurrentScope;
    if (!api || !account || !isCurrent()) {
      return;
    }
    const handle = await this.rooms.load(account).catch(() => undefined);
    if (!handle || !canRestore()) {
      return;
    }

    try {
      const playback = await fetchSonosPlayback(api, handle);
      if (api !== this.api || !isCurrent() || this.currentHandle() !== undefined) {
        return;
      }
      if (isSonosPlaybackLive(playback) && canRestore()) {
        this.apply(playback);
      } else if (!isSonosPlaybackLive(playback)) {
        this.remember(undefined);
      }
    } catch (error) {
      if (error instanceof AccountsApiError && error.status === 404) {
        this.remember(undefined);
      }
    }
  }

  /** Re-reads the room for the current handle. */
  async refresh(): Promise<SonosPlayback | undefined> {
    const api = this.api;
    const isCurrent = this.isCurrentScope;
    const handle = this.currentHandle();
    if (!api || handle === undefined || !isCurrent()) {
      return undefined;
    }

    try {
      const playback = await fetchSonosPlayback(api, handle);
      if (api === this.api && isCurrent() && handle === this.currentHandle()) {
        this.apply(playback);
      }
      return playback;
    } catch (error) {
      const gone =
        error instanceof AccountsApiError &&
        (error.status === 404 || error.code === 'sonos_reconnect_required');
      if (gone && api === this.api && isCurrent() && handle === this.currentHandle()) {
        this.endPlayback(this.roomName());
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
   * same command ID and body (the server reconciles rather than repeats it)
   * and then checked the same way before the listener is offered a retry.
   * One command runs at a time; one sent while another is pending is dropped.
   */
  async command(transport: SonosTransport): Promise<boolean> {
    const api = this.api;
    const isCurrent = this.isCurrentScope;
    const current = this.state;
    if (!api || !isCurrent() || current.kind !== 'active' || current.pending) {
      return false;
    }
    const playback = current.playback;
    const handle = playback.handle;
    const itemId = playback.occurrence?.itemId;
    if (!itemId) {
      return false;
    }
    if (
      transport.action === 'skip' &&
      playback.occurrence?.occurrenceId === transport.occurrenceId
    ) {
      // Already on that occurrence; the server would only confirm it.
      return true;
    }
    const body = transportBody(transport, randomUUID(), {
      itemId,
      queueVersion: playback.queueVersion,
    });
    this.set({ ...current, pending: transport.action, commandError: undefined });

    const sendError = await this.send(api, handle, body, isCurrent);
    if (api !== this.api || !isCurrent()) {
      return false;
    }
    if (sendError !== undefined) {
      await this.refresh();
      this.finishCommand(handle, sendError);
      return false;
    }

    for (let attempt = 0; attempt < this.timing.confirmAttempts; attempt += 1) {
      await this.timing.wait(this.timing.confirmIntervalMs);
      if (api !== this.api || !isCurrent()) {
        return false;
      }
      const latest = await this.refresh();
      if (handle !== this.currentHandle()) {
        return false;
      }
      if (latest && reachedTransport(latest, transport, itemId)) {
        this.finishCommand(handle);
        return true;
      }
    }
    this.finishCommand(handle, 'Sonos didn’t confirm. Try again.');
    return false;
  }

  /** Reads the room's queue, or undefined when it can't be read now. */
  async fetchQueue(): Promise<{ handle: string; queue: SonosQueue } | undefined> {
    const api = this.api;
    const isCurrent = this.isCurrentScope;
    const handle = this.currentHandle();
    if (!api || handle === undefined || !isCurrent()) {
      return undefined;
    }
    try {
      const queue = await fetchSonosQueue(api, handle);
      return api === this.api && isCurrent() && handle === this.currentHandle()
        ? { handle, queue }
        : undefined;
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
    const api = this.api;
    const isCurrent = this.isCurrentScope;
    const current = this.state;
    const itemId = current.kind === 'active' ? current.playback.occurrence?.itemId : undefined;
    if (!api || !isCurrent() || current.kind !== 'active' || !itemId) {
      return { kind: 'failed' };
    }
    const handle = current.playback.handle;
    const edit = { commandId: randomUUID(), expectedVersion, expectedItemId: itemId, entries };

    try {
      const version = await saveSonosQueue(api, handle, edit).catch((error: unknown) => {
        if (error instanceof AccountsApiError && error.retryable && api === this.api) {
          return saveSonosQueue(api, handle, edit);
        }
        throw error;
      });
      this.recordQueueVersion(handle, version);
      return { kind: 'saved', version };
    } catch (error) {
      if (error instanceof AccountsApiError && error.code === 'sonos_playback_changed') {
        return { kind: 'trackMoved' };
      }
      if (error instanceof AccountsApiError && (error.status === 409 || error.status === 422)) {
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
    const api = this.api;
    const handle = this.currentHandle();
    if (!api || handle === undefined) {
      return;
    }
    try {
      const volume = await fetchSonosVolume(api, handle);
      const current = this.state;
      if (api === this.api && current.kind === 'active' && current.playback.handle === handle) {
        this.showVolume(current, volume);
      }
    } catch {
      // The controls keep the last volume they read.
    }
  }

  /**
   * Sets the group's volume (0 to 100) or mute. These apply to the whole
   * group, whatever it is playing, so the controls send only the final value
   * and then read the volume back.
   */
  async setVolume(change: { volume: number } | { muted: boolean }) {
    const api = this.api;
    const isCurrent = this.isCurrentScope;
    const current = this.state;
    if (!api || !isCurrent() || current.kind !== 'active' || current.volume?.fixed) {
      return;
    }
    const handle = current.playback.handle;
    const body =
      'volume' in change
        ? { action: 'volume', command_id: randomUUID(), volume: Math.round(change.volume) }
        : { action: 'mute', command_id: randomUUID(), muted: change.muted };
    if (current.volume) {
      this.showVolume(current, { ...current.volume, ...change });
    }

    const sendError = await this.send(api, handle, body, isCurrent);
    if (sendError !== undefined) {
      this.finishCommand(handle, sendError);
    }
    await this.refreshVolume();
  }

  /**
   * Sends a command body, retrying a lost response once with the same body.
   * Returns a message for the listener when the command was refused, or
   * undefined when it was accepted or may have been.
   */
  private async send(
    api: AuthorizedAccountsApiClient,
    handle: string,
    body: Record<string, unknown>,
    isCurrent: () => boolean
  ): Promise<string | undefined> {
    try {
      await sendSonosCommand(api, handle, body).catch((error: unknown) => {
        if (
          error instanceof AccountsApiError &&
          error.retryable &&
          api === this.api &&
          isCurrent() &&
          handle === this.currentHandle()
        ) {
          return sendSonosCommand(api, handle, body);
        }
        throw error;
      });
      return undefined;
    } catch (error) {
      if (!(error instanceof AccountsApiError)) {
        return 'Sonos didn’t take that. Try again.';
      }
      if (error.retryable) {
        // Lost twice: the room is read to find out whether it took.
        return undefined;
      }
      return commandRefusal(error.code);
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

  private apply(playback: SonosPlayback) {
    if (!isSonosPlaybackLive(playback)) {
      this.endPlayback(playback.groupName);
      return;
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
      return;
    }
    const sameRoom = current.kind === 'active' && current.playback.handle === playback.handle;
    const volume = sameRoom ? current.volume : this.volumes.get(playback.groupId);
    this.set({ kind: 'active', playback, pending, volume });
  }

  private showVolume(current: Extract<SonosRemoteState, { kind: 'active' }>, volume: SonosVolume) {
    this.volumes.set(current.playback.groupId, volume);
    this.set({ ...current, volume });
  }

  /** The handle no longer plays this device's queue; the device forgets the room. */
  private endPlayback(endedRoom: string | undefined) {
    this.remember(undefined);
    this.set(endedRoom === undefined ? { kind: 'none' } : { kind: 'none', endedRoom });
  }

  private remember(handle: string | undefined) {
    if (this.account) {
      void this.rooms.save(this.account, handle).catch(() => {});
    }
  }

  private roomName(): string | undefined {
    const current = this.state;
    return current.kind === 'active'
      ? current.playback.groupName
      : current.kind === 'checking'
        ? current.groupName
        : undefined;
  }

  private currentHandle(): string | undefined {
    const current = this.state;
    return current.kind === 'active'
      ? current.playback.handle
      : current.kind === 'checking'
        ? current.handle
        : undefined;
  }

  private set(next: SonosRemoteState) {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}

/** What to tell the listener when Sonos refuses a command, by the server's code. */
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

/** What to tell the listener when the room keeps its queue, by the server's code. */
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

export const sonosRemote = new SonosRemoteStore();

export function useSonosRemote(): SonosRemoteState {
  return useSyncExternalStore(sonosRemote.subscribe, sonosRemote.getState, sonosRemote.getState);
}
