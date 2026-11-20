import type { AuthorizedAccountsApiClient } from '@/relisten/accounts/api/accounts_api_client';

/**
 * Playback a handoff started on a Sonos room, addressed by its playback
 * handle. The server reads the room on each request, so a response is the
 * room's state at `observedAt`.
 */
const BASE = '/v1/integrations/sonos/playback';

/** The queue occurrence the room is playing, with what to display for it. */
export interface SonosOccurrence {
  /** Stable for this occurrence, even when the same recording is queued twice. */
  itemId: string;
  queueIndex: number;
  trackId: string;
  name: string;
  durationMillis: number | null;
  artist: string | null;
  album: string | null;
  imageUrl: string | null;
}

/**
 * - `active`: the room is playing (or paused on) this queue; state fields are set.
 * - `unconfirmed`: the room couldn't confirm its current item just now; check again.
 * - `evicted`: the room moved on to something else, so this handle has ended.
 * Other statuses (`failed`, `revoked`) also mean the handle has ended.
 */
export interface SonosPlayback {
  handle: string;
  groupId: string;
  groupName: string;
  status: string;
  /** Sonos's own state name, such as `PLAYBACK_STATE_PLAYING`. */
  playbackState: string | null;
  occurrence: SonosOccurrence | null;
  positionMillis: number | null;
  observedAt: number | null;
}

export type SonosTransportAction = 'play' | 'pause';

export function isSonosPlaying(playback: SonosPlayback): boolean {
  return (
    playback.playbackState === 'PLAYBACK_STATE_PLAYING' ||
    playback.playbackState === 'PLAYBACK_STATE_BUFFERING'
  );
}

/** Whether the handle still addresses this account's queue in the room. */
export function isSonosPlaybackLive(playback: SonosPlayback): boolean {
  return playback.status === 'active' || playback.status === 'unconfirmed';
}

/** Whether the room shows the state `action` asked for. */
export function reachedAction(playback: SonosPlayback, action: SonosTransportAction): boolean {
  return (
    playback.status === 'active' &&
    playback.playbackState ===
      (action === 'play' ? 'PLAYBACK_STATE_PLAYING' : 'PLAYBACK_STATE_PAUSED')
  );
}

/** The playhead now, advancing from the last observation while the room plays. */
export function estimatedPositionMillis(playback: SonosPlayback, now: number): number {
  const base = playback.positionMillis ?? 0;
  const elapsed =
    isSonosPlaying(playback) && playback.observedAt !== null
      ? Math.max(0, now - playback.observedAt)
      : 0;
  const duration = playback.occurrence?.durationMillis;
  return duration ? Math.min(base + elapsed, duration) : base + elapsed;
}

export async function fetchActiveSonosPlayback(
  api: AuthorizedAccountsApiClient
): Promise<SonosPlayback[]> {
  const body = await api.request<unknown>(BASE);
  return Array.isArray(body) ? body.flatMap((item) => parsePlayback(item) ?? []) : [];
}

export async function fetchSonosPlayback(
  api: AuthorizedAccountsApiClient,
  handle: string
): Promise<SonosPlayback> {
  const playback = parsePlayback(
    await api.request<unknown>(`${BASE}/${encodeURIComponent(handle)}`)
  );
  if (!playback) {
    throw new Error('The Sonos playback response is invalid.');
  }
  return playback;
}

/** Sends play or pause. Acceptance means Sonos took the command, not that the room changed. */
export function sendSonosCommand(
  api: AuthorizedAccountsApiClient,
  handle: string,
  request: { action: SonosTransportAction; command_id: string; expected_item_id: string }
): Promise<void> {
  return api.request<void>(`${BASE}/${encodeURIComponent(handle)}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export function parsePlayback(value: unknown): SonosPlayback | undefined {
  const body = value as Record<string, unknown> | null;
  if (
    typeof body?.playback_handle !== 'string' ||
    typeof body.group_id !== 'string' ||
    typeof body.status !== 'string'
  ) {
    return undefined;
  }
  const observedAt = typeof body.observed_at === 'string' ? Date.parse(body.observed_at) : NaN;
  return {
    handle: body.playback_handle,
    groupId: body.group_id,
    groupName: typeof body.group_name === 'string' ? body.group_name : body.group_id,
    status: body.status,
    playbackState: typeof body.playback_state === 'string' ? body.playback_state : null,
    occurrence: parseOccurrence(body.current_occurrence),
    positionMillis: typeof body.position_millis === 'number' ? body.position_millis : null,
    observedAt: Number.isFinite(observedAt) ? observedAt : null,
  };
}

function parseOccurrence(value: unknown): SonosOccurrence | null {
  const item = value as Record<string, unknown> | null;
  if (typeof item?.item_id !== 'string' || typeof item.name !== 'string') {
    return null;
  }
  const text = (key: string) => (typeof item[key] === 'string' ? (item[key] as string) : null);
  return {
    itemId: item.item_id,
    queueIndex: typeof item.queue_index === 'number' ? item.queue_index : 0,
    trackId: text('track_id') ?? '',
    name: item.name,
    durationMillis: typeof item.duration_millis === 'number' ? item.duration_millis : null,
    artist: text('artist'),
    album: text('album'),
    imageUrl: text('image_url'),
  };
}
