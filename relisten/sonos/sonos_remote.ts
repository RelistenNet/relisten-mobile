import { useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';
import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import {
  fetchActiveSonosPlayback,
  fetchSonosPlayback,
  isSonosPlaybackLive,
  reachedAction,
  sendSonosCommand,
  type SonosPlayback,
  type SonosTransportAction,
} from './sonos_playback';

/**
 * The Sonos playback this account is controlling, if any.
 *
 * - `checking`: a handle is known but the room hasn't been read yet, or it
 *   couldn't confirm its current item; the UI says so and controls wait.
 * - `active`: the last room state read, plus a play/pause waiting for the
 *   room to show it (`pending`) or one that didn't take (`commandError`).
 */
export type SonosRemoteState =
  | { kind: 'none' }
  | { kind: 'checking'; handle: string; groupName: string; pending?: SonosTransportAction }
  | {
      kind: 'active';
      playback: SonosPlayback;
      pending?: SonosTransportAction;
      commandError?: string;
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
   * Plays or pauses the room, then reads it until the room shows the request.
   * A lost response may still have reached Sonos, so it is checked the same
   * way before the listener is offered a retry.
   */
  async command(action: SonosTransportAction) {
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
    const request = { action, command_id: randomUUID(), expected_item_id: itemId };
    this.set({ ...current, pending: action, commandError: undefined });

    try {
      await sendSonosCommand(api, handle, request).catch((error: unknown) => {
        if (
          error instanceof AccountsApiError &&
          error.retryable &&
          api === this.api &&
          isCurrent() &&
          handle === this.currentHandle()
        ) {
          return sendSonosCommand(api, handle, request);
        }
        throw error;
      });
    } catch (error) {
      if (api !== this.api || !isCurrent()) {
        return;
      }
      if (error instanceof AccountsApiError && error.code === 'sonos_playback_inactive') {
        await this.refresh();
        this.finishCommand(handle, 'The room is playing something else.');
        return;
      }
      if (error instanceof AccountsApiError && error.code === 'sonos_playback_changed') {
        await this.refresh();
        this.finishCommand(handle, 'The track changed. Try again.');
        return;
      }
      if (!(error instanceof AccountsApiError) || !error.retryable) {
        this.finishCommand(handle, 'Sonos didn’t take that. Try again.');
        return;
      }
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
      if (playback?.occurrence?.itemId === itemId && reachedAction(playback, action)) {
        this.finishCommand(handle);
        return;
      }
    }
    this.finishCommand(handle, 'Sonos didn’t confirm. Try again.');
  }

  private finishCommand(handle: string, commandError?: string) {
    const current = this.state;
    if (current.kind === 'active' && current.playback.handle === handle) {
      this.set({ kind: 'active', playback: current.playback, commandError });
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
    this.set({ kind: 'active', playback, pending });
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

export const sonosRemote = new SonosRemoteStore();

export function useSonosRemote(): SonosRemoteState {
  return useSyncExternalStore(sonosRemote.subscribe, sonosRemote.getState, sonosRemote.getState);
}
