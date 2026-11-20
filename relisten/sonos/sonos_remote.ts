import { useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import {
  fetchActiveSonosPlayback,
  fetchSonosPlayback,
  fetchSonosVolume,
  isSonosPlaybackLive,
  reachedTransport,
  sendSonosCommand,
  type SonosPlayback,
  type SonosTransport,
  type SonosTransportAction,
  type SonosVolume,
  transportBody,
} from './sonos_playback';

/**
 * The Sonos playback this account is controlling, if any.
 *
 * - `checking`: a handle is known but the room hasn't been read yet, or it
 *   couldn't confirm its current item; the UI says so and controls wait.
 * - `active`: the last room state read, plus a command waiting for the room
 *   to show it (`pending`) or one that didn't take (`commandError`), and the
 *   group's volume once the controls have read it.
 */
export type SonosRemoteState =
  | { kind: 'none' }
  | { kind: 'checking'; handle: string; groupName: string; pending?: SonosTransportAction }
  | {
      kind: 'active';
      playback: SonosPlayback;
      pending?: SonosTransportAction;
      commandError?: string;
      volume?: SonosVolume;
    };

type Listener = () => void;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const currentScope = () => true;

export interface SonosRemoteTiming {
  wait: (ms: number) => Promise<void>;
  confirmIntervalMs: number;
  confirmAttempts: number;
}

/**
 * Holds the active handle and keeps its room state fresh. One handle at a
 * time: adopting a new one (a later handoff) replaces the old, and a response
 * that arrives for a replaced handle is dropped.
 *
 * Only the server knows the room's state. The phone stays paused while Sonos
 * plays, so local listening history never counts Sonos progress.
 */
export class SonosRemoteStore {
  private isCurrentScope = currentScope;
  private state: SonosRemoteState = { kind: 'none' };
  private readonly listeners = new Set<Listener>();
  private api: AuthorizedAccountsApiClient | undefined;

  constructor(
    private readonly timing: SonosRemoteTiming = {
      wait,
      confirmIntervalMs: 750,
      confirmAttempts: 8,
    }
  ) {}

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  /** The signed-in account's client, or undefined when signed out, which ends remote control. */
  bind(api: AuthorizedAccountsApiClient | undefined, isCurrentScope = currentScope) {
    if (api === this.api && isCurrentScope === this.isCurrentScope) {
      return;
    }
    this.api = api;
    this.isCurrentScope = isCurrentScope;
    this.set({ kind: 'none' });
  }

  /** Takes over the handle a handoff just returned and reads its room. */
  adopt(handle: string, groupName: string) {
    this.set({ kind: 'checking', handle, groupName });
    void this.refresh();
  }

  /**
   * Finds playback this account already has running, on launch or when the
   * app returns. Reading state never sends a command.
   */
  async discover() {
    const api = this.api;
    const isCurrent = this.isCurrentScope;
    if (!api || !isCurrent()) {
      return;
    }
    let active: SonosPlayback[];
    try {
      active = await fetchActiveSonosPlayback(api);
    } catch {
      return;
    }
    if (api !== this.api || !isCurrent()) {
      return;
    }

    const handle = this.currentHandle();
    const match = active.find((playback) => playback.handle === handle) ?? active[0];
    if (match && (handle === undefined || match.handle === handle)) {
      this.apply(match);
    } else if (handle !== undefined && !active.some((playback) => playback.handle === handle)) {
      // Discovery lists only confirmed playback; read the handle itself before giving up on it.
      await this.refresh();
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
        this.set({ kind: 'none' });
      }
      return undefined;
    }
  }

  /**
   * Sends a transport command for the current occurrence, then reads the room
   * until it shows the result. A lost response may still have reached Sonos,
   * so it is retried once with the same command ID and body (the server
   * reconciles rather than repeats it) and then checked the same way before
   * the listener is offered a retry. One command runs at a time.
   */
  async command(transport: SonosTransport) {
    const api = this.api;
    const isCurrent = this.isCurrentScope;
    const current = this.state;
    if (!api || !isCurrent() || current.kind !== 'active' || current.pending) {
      return;
    }
    const handle = current.playback.handle;
    const itemId = current.playback.occurrence?.itemId;
    if (!itemId) {
      return;
    }
    const body = transportBody(transport, randomUUID(), itemId);
    this.set({ ...current, pending: transport.action, commandError: undefined });

    const sendError = await this.send(api, handle, body, isCurrent);
    if (api !== this.api || !isCurrent()) {
      return;
    }
    if (sendError !== undefined) {
      await this.refresh();
      this.finishCommand(handle, sendError);
      return;
    }

    for (let attempt = 0; attempt < this.timing.confirmAttempts; attempt += 1) {
      await this.timing.wait(this.timing.confirmIntervalMs);
      if (api !== this.api || !isCurrent()) {
        return;
      }
      const playback = await this.refresh();
      if (handle !== this.currentHandle()) {
        return;
      }
      if (playback && reachedTransport(playback, transport, itemId)) {
        this.finishCommand(handle);
        return;
      }
    }
    this.finishCommand(handle, 'Sonos didn’t confirm. Try again.');
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
        this.set({ ...current, volume });
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
      this.set({ ...current, volume: { ...current.volume, ...change } });
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
      this.set({ kind: 'none' });
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
    const volume =
      current.kind === 'active' && current.playback.handle === playback.handle
        ? current.volume
        : undefined;
    this.set({ kind: 'active', playback, pending, volume });
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

export const sonosRemote = new SonosRemoteStore();

export function useSonosRemote(): SonosRemoteState {
  return useSyncExternalStore(sonosRemote.subscribe, sonosRemote.getState, sonosRemote.getState);
}
