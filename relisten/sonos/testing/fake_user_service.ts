import { vi } from 'vitest';
import { AccountsApiError } from '@/relisten/accounts/api/accounts_api_client';
import type { SonosQueueEntry } from '../sonos_playback';

/**
 * The User Service's Sonos routes for one room, enough to drive the store
 * the way the real server does: it keeps the room's state, applies commands
 * and queue edits under the server's rules, and records what was sent.
 * A response can be held back, so tests can stage two requests overlapping.
 */
export class FakeUserService {
  readonly room = {
    handle: 'h1',
    groupId: 'g1',
    groupName: 'Alec’s Office',
    status: 'active',
    playbackState: 'PLAYBACK_STATE_PAUSED',
    occurrenceId: 'q1',
    positionMillis: 1000,
    queue: {
      version: 1,
      entries: [
        { occurrenceId: 'q1', trackId: 'track_x' },
        { occurrenceId: 'q2', trackId: 'track_y' },
      ] as SonosQueueEntry[],
    },
    volume: { volume: 30, muted: false, fixed: false },
    repeatMode: 'off' as 'off' | 'all' | 'one',
    canRepeat: true,
    canRepeatOne: true,
  };
  /** When false, playback readings leave out `queue_version`, as an older server might. */
  reportsQueueVersion = true;
  /** When false, commands are accepted but the room never changes, as if Sonos dropped them. */
  appliesCommands = true;
  /** Every request, in order. */
  readonly sent: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  private readonly failures: { route: string; error: Error }[] = [];
  private readonly holds: { route: string; release?: () => void; held: Promise<void> }[] = [];
  private readonly appliedCommands = new Set<string>();
  private clock = Date.parse('2026-11-20T06:00:00Z');

  request = vi.fn(async (path: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    this.sent.push({ method, path, body });
    const route = `${method} ${path}`;

    const failure = this.failures.findIndex((entry) => route.endsWith(entry.route));
    // The response is decided when the request arrives, as the server would.
    const response =
      failure >= 0
        ? Promise.reject(this.failures.splice(failure, 1)[0].error)
        : Promise.resolve().then(() => this.answer(method, path, body));
    const answered = response.catch((error: unknown) => {
      throw error;
    });

    const hold = this.holds.findIndex((entry) => route.endsWith(entry.route));
    if (hold >= 0) {
      const [{ held }] = this.holds.splice(hold, 1);
      const result = await answered.then(
        (value) => ({ value }),
        (error: unknown) => ({ error })
      );
      await held;
      if ('error' in result) {
        throw result.error;
      }
      return result.value;
    }
    return answered;
  });

  /** The next request whose route ends with `route` (for example `'POST /commands'`) fails. */
  failNext(route: string, error: Error) {
    this.failures.push({ route, error });
  }

  /** Holds the next response for `route` until the returned function is called. */
  holdNext(route: string): () => void {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    this.holds.push({ route, held, release });
    return release;
  }

  /** The bodies of the commands sent, in order. */
  commands(): Record<string, unknown>[] {
    return this.sent
      .filter((entry) => entry.method === 'POST' && entry.path.endsWith('/commands'))
      .map((entry) => entry.body ?? {});
  }

  requestsTo(route: string): number {
    return this.sent.filter((entry) => `${entry.method} ${entry.path}`.endsWith(route)).length;
  }

  private answer(method: string, path: string, body: Record<string, unknown> | undefined) {
    const room = this.room;
    const base = `/v1/integrations/sonos/playback/${room.handle}`;
    if (method === 'GET' && path === base) {
      return this.playback();
    }
    if (method === 'POST' && path === `${base}/commands`) {
      return this.applyCommand(body ?? {});
    }
    if (method === 'GET' && path === `${base}/queue`) {
      return {
        queue_version: room.queue.version,
        occurrences: room.queue.entries.map((entry) => ({
          occurrence_id: entry.occurrenceId,
          track_id: entry.trackId,
        })),
      };
    }
    if (method === 'PUT' && path === `${base}/queue`) {
      return this.saveQueue(body ?? {});
    }
    if (method === 'GET' && path === `${base}/volume`) {
      return { ...room.volume };
    }
    if (method === 'POST' && path === '/v1/integrations/sonos/handoffs') {
      return { request_id: body?.request_id, status: 'loaded', playback_handle: HANDLE_UUID };
    }
    throw new AccountsApiError('Not found', 404, null, false);
  }

  private playback() {
    const room = this.room;
    this.clock += 1000;
    const index = room.queue.entries.findIndex((entry) => entry.occurrenceId === room.occurrenceId);
    return {
      playback_handle: room.handle,
      group_id: room.groupId,
      group_name: room.groupName,
      status: room.status,
      playback_state: room.playbackState,
      position_millis: room.positionMillis,
      observed_at: new Date(this.clock).toISOString(),
      queue_version: this.reportsQueueVersion ? room.queue.version : undefined,
      repeat_mode: room.repeatMode,
      can_repeat: room.canRepeat,
      can_repeat_one: room.canRepeatOne,
      current_occurrence:
        room.status === 'active'
          ? {
              item_id: `item-${room.occurrenceId}`,
              occurrence_id: room.occurrenceId,
              queue_index: index,
              duration_millis: 400000,
            }
          : null,
    };
  }

  private applyCommand(body: Record<string, unknown>) {
    const room = this.room;
    if (
      body.expected_item_id !== undefined &&
      body.expected_item_id !== `item-${room.occurrenceId}`
    ) {
      throw new AccountsApiError('', 409, 'sonos_playback_changed', false);
    }
    // A repeated command ID is the same command; the server doesn't apply it twice.
    if (this.appliedCommands.has(String(body.command_id))) {
      return { status: 'accepted' };
    }
    this.appliedCommands.add(String(body.command_id));
    if (!this.appliesCommands) {
      return { status: 'accepted' };
    }

    switch (body.action) {
      case 'play':
        room.playbackState = 'PLAYBACK_STATE_PLAYING';
        break;
      case 'pause':
        room.playbackState = 'PLAYBACK_STATE_PAUSED';
        break;
      case 'seek':
        room.positionMillis = Number(body.position_millis);
        break;
      case 'skip':
        if (body.expected_queue_version !== room.queue.version) {
          throw new AccountsApiError('', 409, 'sonos_queue_changed', false);
        }
        room.occurrenceId = String(body.target_occurrence_id);
        room.positionMillis = 0;
        break;
      case 'volume':
        room.volume = { ...room.volume, volume: Number(body.volume) };
        break;
      case 'mute':
        room.volume = { ...room.volume, muted: body.muted === true };
        break;
      case 'repeat': {
        const mode = body.repeat_mode as 'off' | 'all' | 'one';
        if ((mode === 'all' && !room.canRepeat) || (mode === 'one' && !room.canRepeatOne)) {
          throw new AccountsApiError('', 409, 'sonos_command_unavailable', false);
        }
        room.repeatMode = mode;
        break;
      }
    }
    return { status: 'accepted' };
  }

  private saveQueue(body: Record<string, unknown>) {
    const room = this.room;
    if (body.expected_version !== room.queue.version) {
      throw new AccountsApiError('', 409, 'sonos_queue_changed', false);
    }
    if (body.expected_item_id !== `item-${room.occurrenceId}`) {
      throw new AccountsApiError('', 409, 'sonos_playback_changed', false);
    }
    const entries = (body.occurrences as { occurrence_id: string; track_id: string }[]).map(
      (row) => ({ occurrenceId: row.occurrence_id, trackId: row.track_id })
    );
    const playing = room.queue.entries.findIndex(
      (entry) => entry.occurrenceId === room.occurrenceId
    );
    const prefix = (list: SonosQueueEntry[]) =>
      list
        .slice(0, playing + 1)
        .map((entry) => entry.occurrenceId)
        .join();
    if (prefix(entries) !== prefix(room.queue.entries)) {
      throw new AccountsApiError('', 409, 'sonos_queue_current_protected', false);
    }
    room.queue = { version: room.queue.version + 1, entries };
    return { queue_version: room.queue.version };
  }
}

/** A playback handle in the form the handoff receipt requires. */
export const HANDLE_UUID = '00000000-0000-4000-8000-000000000001';

/** A response that never arrived; the client may send the same request again. */
export const lost = () => new AccountsApiError('Offline', null, null, true);
