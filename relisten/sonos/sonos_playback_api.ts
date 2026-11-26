// The User Service's routes for a room's playback, addressed by the playback
// handle a handoff returned. Reads are marked routine: the phone repeats them
// on a timer while a room plays.

import type { AuthorizedAccountsApiClient } from '@/relisten/accounts/api/accounts_api_client';
import { SONOS_REQUEST_TIMEOUT_MS } from './sonos_api';
import {
  parsePlayback,
  type SonosPlayback,
  type SonosQueue,
  type SonosQueueEntry,
  type SonosVolume,
  wireOccurrences,
} from './sonos_playback';

const BASE = '/v1/integrations/sonos/playback';

const handlePath = (handle: string) => `${BASE}/${encodeURIComponent(handle)}`;

export async function fetchSonosPlayback(
  api: AuthorizedAccountsApiClient,
  handle: string
): Promise<SonosPlayback> {
  const playback = parsePlayback(
    await api.request<unknown>(handlePath(handle), {
      routine: true,
      timeoutMs: SONOS_REQUEST_TIMEOUT_MS,
    })
  );
  if (!playback) {
    throw new Error('The Sonos playback response is invalid.');
  }
  return playback;
}

/**
 * Sends a command body. Acceptance means Sonos took the command, not that
 * the room changed; the caller reads the room to confirm. A retry must reuse
 * the same `command_id` and body.
 */
export function sendSonosCommand(
  api: AuthorizedAccountsApiClient,
  handle: string,
  request: Record<string, unknown>
): Promise<unknown> {
  return api.request<unknown>(`${handlePath(handle)}/commands`, {
    method: 'POST',
    timeoutMs: SONOS_REQUEST_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function fetchSonosQueue(
  api: AuthorizedAccountsApiClient,
  handle: string
): Promise<SonosQueue> {
  const body = await api.request<Record<string, unknown> | null>(`${handlePath(handle)}/queue`, {
    routine: true,
    timeoutMs: SONOS_REQUEST_TIMEOUT_MS,
  });
  const rows = Array.isArray(body?.occurrences) ? body.occurrences : undefined;
  if (typeof body?.queue_version !== 'number' || !rows) {
    throw new Error('The Sonos queue response is invalid.');
  }

  const entries = rows.flatMap((row: Record<string, unknown> | null) =>
    typeof row?.occurrence_id === 'string' && typeof row.track_id === 'string'
      ? [{ occurrenceId: row.occurrence_id, trackId: row.track_id }]
      : []
  );
  if (entries.length !== rows.length) {
    throw new Error('The Sonos queue response is invalid.');
  }
  return { version: body.queue_version, entries };
}

/**
 * Replaces the room's queue with `entries`, the full order through its end.
 * Saved only if the queue is still at `expectedVersion` and the room is still
 * on `expectedItemId`; returns the new version. A retry must reuse the same
 * `commandId` and entries.
 */
export async function saveSonosQueue(
  api: AuthorizedAccountsApiClient,
  handle: string,
  edit: {
    commandId: string;
    expectedVersion: number;
    expectedItemId: string;
    entries: readonly SonosQueueEntry[];
  }
): Promise<number> {
  const body = await api.request<Record<string, unknown> | null>(`${handlePath(handle)}/queue`, {
    method: 'PUT',
    timeoutMs: SONOS_REQUEST_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command_id: edit.commandId,
      expected_version: edit.expectedVersion,
      expected_item_id: edit.expectedItemId,
      occurrences: wireOccurrences(edit.entries),
    }),
  });
  if (typeof body?.queue_version !== 'number') {
    throw new Error('The Sonos queue edit response is invalid.');
  }
  return body.queue_version;
}

export async function fetchSonosVolume(
  api: AuthorizedAccountsApiClient,
  handle: string
): Promise<SonosVolume> {
  const body = await api.request<Record<string, unknown> | null>(`${handlePath(handle)}/volume`, {
    routine: true,
    timeoutMs: SONOS_REQUEST_TIMEOUT_MS,
  });
  if (typeof body?.volume !== 'number') {
    throw new Error('The Sonos volume response is invalid.');
  }
  return { volume: body.volume, muted: body.muted === true, fixed: body.fixed === true };
}
