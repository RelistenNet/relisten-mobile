// A Sonos room's playback as the User Service reports it, and the rules the
// phone applies to it: whether the room plays, whether a command took, and
// where the playhead is between reads. The HTTP calls that read and change
// it are in `sonos_playback_api.ts`.
//
// A "room" in this app is a Sonos group: one speaker or several playing
// together. Fields keep Sonos's names (`groupId`, `groupName`).

import { trackIdForSourceTrack } from '@/relisten/realm/catalog_track_id';
import { isUuidV7TypedId } from '@/relisten/util/typed_uuid_id';
import type { PlaylistQueueContext } from '@/relisten/player/relisten_player_queue';

/** The queue occurrence the room is playing. */
export interface SonosOccurrence {
  /** Sonos's item for this occurrence; commands name it to say which track they were meant for. */
  itemId: string;
  /** The phone queue's identifier for this occurrence, sent with the handoff or queue edit. */
  occurrenceId: string;
  durationMillis: number | null;
}

/**
 * - `active`: the room is playing (or paused on) this queue; state fields are set.
 * - `unconfirmed`: the room couldn't confirm its current item just now; check again.
 * - `evicted`: the room moved on to something else, so this handle has ended.
 * - `failed`, `revoked`: the handle has ended; `revoked` because the account's
 *   Sonos link ended.
 */
export type SonosPlaybackStatus = 'active' | 'unconfirmed' | 'evicted' | 'failed' | 'revoked';

/** The room's repeat setting, which applies to its whole group. */
export type SonosRepeatMode = 'off' | 'all' | 'one';

/** A room's playback, as of `observedAt`. The server reads the room on each request. */
export interface SonosPlayback {
  handle: string;
  groupId: string;
  groupName: string;
  status: SonosPlaybackStatus;
  /** Sonos's own state name, such as `PLAYBACK_STATE_PLAYING`. */
  playbackState: string | null;
  occurrence: SonosOccurrence | null;
  positionMillis: number | null;
  /** When the server observed this state, in epoch milliseconds. */
  observedAt: number | null;
  /** Changes with every saved queue edit, from any device, and never goes back. */
  queueVersion: number | null;
  /** Null when the room didn't say, as from a server without repeat support. */
  repeatMode: SonosRepeatMode | null;
  /** Whether the room offers repeating the queue, and one track; false when it didn't say. */
  canRepeat: boolean;
  canRepeatOne: boolean;
}

/** Group volume. `fixed` means the group won't take volume changes. */
export interface SonosVolume {
  volume: number;
  muted: boolean;
  fixed: boolean;
}

/** One occurrence of the room's queue: the phone's identifier and the recording. */
export interface SonosQueueEntry {
  occurrenceId: string;
  trackId: string;
  playlistId?: string;
  playlistEntryId?: string;
}

/** The room's queue in order, as of `version`. */
export interface SonosQueue {
  version: number;
  entries: SonosQueueEntry[];
}

/** A queue occurrence as the player holds it; the same recording can appear more than once. */
export interface QueueOccurrence {
  identifier: string;
  sourceTrack: { uuid: string };
  playlistContext?: PlaylistQueueContext;
}

/** The room's entry for a phone queue occurrence. The phone's identifier is the occurrence ID. */
export function sonosQueueEntry(track: QueueOccurrence): SonosQueueEntry {
  const playlist = track.playlistContext;
  return {
    occurrenceId: track.identifier,
    trackId: trackIdForSourceTrack(track.sourceTrack),
    ...(playlist &&
    isUuidV7TypedId(playlist.playlistId, 'playlist') &&
    isUuidV7TypedId(playlist.entryId, 'playlist_entry')
      ? { playlistId: playlist.playlistId, playlistEntryId: playlist.entryId }
      : {}),
  };
}

/** Queue entries as the User Service's handoff and queue routes take them. */
export function wireOccurrences(entries: readonly SonosQueueEntry[]) {
  return entries.map((entry) => ({
    occurrence_id: entry.occurrenceId,
    track_id: entry.trackId,
    ...(entry.playlistId ? { playlist_id: entry.playlistId } : {}),
    ...(entry.playlistEntryId ? { playlist_entry_id: entry.playlistEntryId } : {}),
  }));
}

/**
 * A transport command for the room's current occurrence. Each is sent with
 * the occurrence it was meant for (`expected_item_id`), so a command that
 * arrives after the track changed is refused rather than applied to the
 * wrong track. `skip` moves to an occurrence in the queue, starting it at
 * zero and keeping play or pause.
 */
export type SonosTransport =
  | { action: 'play' | 'pause' }
  | { action: 'seek'; positionMillis: number }
  | { action: 'skip'; occurrenceId: string };

export type SonosTransportAction = SonosTransport['action'];

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

/** How far a confirmed seek may land from its target, since the room keeps playing. */
const SEEK_TOLERANCE_MILLIS = 5000;

/**
 * Whether the room shows what `transport` asked for, given the occurrence it
 * was sent for. A skip is confirmed by the target occurrence; the others by
 * the same occurrence in the requested state or position.
 */
export function reachedTransport(
  playback: SonosPlayback,
  transport: SonosTransport,
  fromItemId: string
): boolean {
  const itemId = playback.occurrence?.itemId;
  if (playback.status !== 'active' || !itemId) {
    return false;
  }

  switch (transport.action) {
    case 'skip':
      return playback.occurrence?.occurrenceId === transport.occurrenceId;
    case 'play':
    case 'pause':
      return (
        itemId === fromItemId &&
        playback.playbackState ===
          (transport.action === 'play' ? 'PLAYBACK_STATE_PLAYING' : 'PLAYBACK_STATE_PAUSED')
      );
    case 'seek': {
      const offset = (playback.positionMillis ?? -Infinity) - transport.positionMillis;
      return itemId === fromItemId && offset >= -1000 && offset <= SEEK_TOLERANCE_MILLIS;
    }
  }
}

/**
 * The request body for `transport` on `playback`'s current occurrence. A skip
 * also names the queue version it was chosen from, so the server refuses it
 * if the queue changed in the meantime.
 */
export function transportBody(
  transport: SonosTransport,
  commandId: string,
  playback: { itemId: string; queueVersion: number | null }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    action: transport.action,
    command_id: commandId,
    expected_item_id: playback.itemId,
  };
  if (transport.action === 'seek') {
    body.position_millis = Math.round(transport.positionMillis);
  }
  if (transport.action === 'skip') {
    body.target_occurrence_id = transport.occurrenceId;
    if (playback.queueVersion !== null) {
      body.expected_queue_version = playback.queueVersion;
    }
  }
  return body;
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

const ENDED_STATUSES: readonly SonosPlaybackStatus[] = ['evicted', 'failed', 'revoked'];

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
  const status = body.status as SonosPlaybackStatus;
  return {
    handle: body.playback_handle,
    groupId: body.group_id,
    groupName: typeof body.group_name === 'string' ? body.group_name : body.group_id,
    // A status this app doesn't know means the handle no longer plays its queue.
    status:
      status === 'active' || status === 'unconfirmed' || ENDED_STATUSES.includes(status)
        ? status
        : 'failed',
    playbackState: typeof body.playback_state === 'string' ? body.playback_state : null,
    occurrence: parseOccurrence(body.current_occurrence),
    positionMillis: typeof body.position_millis === 'number' ? body.position_millis : null,
    observedAt: Number.isFinite(observedAt) ? observedAt : null,
    queueVersion: typeof body.queue_version === 'number' ? body.queue_version : null,
    repeatMode: REPEAT_MODES.includes(body.repeat_mode as SonosRepeatMode)
      ? (body.repeat_mode as SonosRepeatMode)
      : null,
    canRepeat: body.can_repeat === true,
    canRepeatOne: body.can_repeat_one === true,
  };
}

const REPEAT_MODES: readonly SonosRepeatMode[] = ['off', 'all', 'one'];

/** What a room's repeat button shows and can do. */
export type SonosRepeat = Pick<SonosPlayback, 'repeatMode' | 'canRepeat' | 'canRepeatOne'>;

/**
 * The mode the repeat button moves to: off, then all, then one, skipping a
 * mode the room doesn't offer. Undefined when the room didn't report its mode
 * or offers nothing else, so the button rests.
 */
export function nextSonosRepeatMode(repeat: SonosRepeat): SonosRepeatMode | undefined {
  const current = repeat.repeatMode;
  if (current === null) {
    return undefined;
  }
  const offered = (mode: SonosRepeatMode) =>
    mode === 'off' || (mode === 'all' ? repeat.canRepeat : repeat.canRepeatOne);
  const start = REPEAT_MODES.indexOf(current);
  for (let step = 1; step < REPEAT_MODES.length; step += 1) {
    const mode = REPEAT_MODES[(start + step) % REPEAT_MODES.length];
    if (offered(mode)) {
      return mode;
    }
  }
  return undefined;
}

function parseOccurrence(value: unknown): SonosOccurrence | null {
  const item = value as Record<string, unknown> | null;
  if (typeof item?.item_id !== 'string' || typeof item.occurrence_id !== 'string') {
    return null;
  }
  return {
    itemId: item.item_id,
    occurrenceId: item.occurrence_id,
    durationMillis: typeof item.duration_millis === 'number' ? item.duration_millis : null,
  };
}
