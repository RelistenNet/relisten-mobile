// The account service's Sonos routes for the account link, rooms and
// handoffs. Sonos credentials stay on the server; the app sends its own
// account token. The routes answer 404 when the server has no Sonos
// configuration, which the app treats as the feature being unavailable
// rather than as an error.

import {
  AccountsApiError,
  type AccountRequestOptions,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import type { wireOccurrences } from './sonos_playback';

const BASE = '/v1/integrations/sonos';

/**
 * How long a Sonos request may wait for an answer. Without a limit, a request
 * on a bad connection (a parking garage, say) waits about a minute, and the
 * phone can't tell the room is out of reach until it gives up. Each call
 * already treats a lost response as "maybe arrived".
 */
const SONOS_REQUEST_TIMEOUT_MS = 8000;

/** An account request with Sonos's time limit. Every Sonos call goes through it. */
export function sonosRequest<T>(
  api: AuthorizedAccountsApiClient,
  path: string,
  options: AccountRequestOptions = {}
): Promise<T> {
  return api.request<T>(path, { timeoutMs: SONOS_REQUEST_TIMEOUT_MS, ...options });
}

/** A Sonos group: one room, or rooms playing together. */
export interface SonosGroup {
  householdId: string;
  id: string;
  name: string;
}

/**
 * Where a handoff stands. `dispatching` means the server doesn't yet know
 * whether the room took the queue; `failed` means Sonos refused before taking
 * over the room, so the phone can carry on; `revoked` means the account link
 * ended underneath it.
 */
export type SonosHandoffStatus =
  | 'dispatching'
  | 'loaded'
  | 'failed'
  | 'revoked'
  | 'evicted'
  | 'interrupted';

export const SONOS_CALLBACK_URL = 'net.relisten.mobile:/sonos/callback';

/** A handoff's status. Once the queue loads, `playbackHandle` addresses the room's playback. */
export type SonosHandoffReceipt =
  | { requestId: string; status: Exclude<SonosHandoffStatus, 'loaded'> }
  | { requestId: string; status: 'loaded'; playbackHandle: string };

export interface SonosHandoffRequest {
  /** Fresh for each explicit handoff, reused with the identical body on retry. */
  request_id: string;
  group_id: string;
  /**
   * The queue in order, one entry per occurrence, duplicates included. Each
   * keeps the phone's identifier, so the room's current occurrence names the
   * phone's queue entry.
   */
  occurrences: ReturnType<typeof wireOccurrences>;
  start_index: number;
  position_millis: number;
}

/** Whether this error means the account's Sonos link must be made again. */
export function needsSonosReconnect(error: unknown): boolean {
  return error instanceof AccountsApiError && error.code === 'sonos_reconnect_required';
}

/** Whether this error means the server offers no Sonos integration. */
export function isSonosUnavailable(error: unknown): boolean {
  return error instanceof AccountsApiError && error.status === 404;
}

export async function fetchSonosLinked(api: AuthorizedAccountsApiClient): Promise<boolean> {
  const body = await sonosRequest<{ linked?: unknown }>(api, `${BASE}/connection`);
  return body?.linked === true;
}

/** Starts linking the account; the URL opens Sonos sign-in in the system browser. */
export async function beginSonosConnect(api: AuthorizedAccountsApiClient): Promise<string> {
  const body = await sonosRequest<{ authorization_url?: unknown }>(
    api,
    `${BASE}/connect?return_to=mobile`,
    { method: 'POST' }
  );
  if (typeof body?.authorization_url !== 'string') {
    throw new Error('The Sonos sign-in link is missing.');
  }
  return body.authorization_url;
}

/**
 * Rooms split by Sonos household, for listing each home on its own. Sonos
 * doesn't name households, so a household is placed by its first room's name
 * (rooms arrive sorted by name), which keeps the order stable between reads.
 */
export function groupSonosHouseholds(groups: readonly SonosGroup[]): SonosGroup[][] {
  const households = new Map<string, SonosGroup[]>();
  for (const group of groups) {
    const rooms = households.get(group.householdId);
    if (rooms) {
      rooms.push(group);
    } else {
      households.set(group.householdId, [group]);
    }
  }

  return [...households.values()].sort((left, right) => left[0].name.localeCompare(right[0].name));
}

export async function fetchSonosGroups(api: AuthorizedAccountsApiClient): Promise<SonosGroup[]> {
  const body = await sonosRequest<unknown>(api, `${BASE}/groups`);
  if (!Array.isArray(body)) {
    throw new Error('The Sonos rooms response is invalid.');
  }
  // Sorted by name, so rooms keep their places between reads.
  return body
    .flatMap((group) =>
      typeof group?.id === 'string' && typeof group.name === 'string'
        ? [{ householdId: String(group.household_id ?? ''), id: group.id, name: group.name }]
        : []
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function startSonosHandoff(
  api: AuthorizedAccountsApiClient,
  request: SonosHandoffRequest
): Promise<SonosHandoffReceipt> {
  return parseReceipt(
    await sonosRequest<unknown>(api, `${BASE}/handoffs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }),
    request.request_id
  );
}

export async function fetchSonosHandoff(
  api: AuthorizedAccountsApiClient,
  requestId: string
): Promise<SonosHandoffReceipt> {
  return parseReceipt(
    await sonosRequest<unknown>(api, `${BASE}/handoffs/${encodeURIComponent(requestId)}`),
    requestId
  );
}

const STATUSES: readonly SonosHandoffStatus[] = [
  'dispatching',
  'loaded',
  'failed',
  'revoked',
  'evicted',
  'interrupted',
];
const PLAYBACK_HANDLE = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

function parseReceipt(value: unknown, requestId: string): SonosHandoffReceipt {
  const body = value as {
    request_id?: unknown;
    status?: unknown;
    playback_handle?: unknown;
  } | null;
  const status = body?.status as SonosHandoffStatus;
  if (body?.request_id !== requestId || !STATUSES.includes(status)) {
    throw new Error('The Sonos handoff response is invalid.');
  }

  if (status !== 'loaded') {
    return { requestId, status };
  }
  if (typeof body.playback_handle !== 'string' || !PLAYBACK_HANDLE.test(body.playback_handle)) {
    throw new Error('The Sonos handoff response is invalid.');
  }
  return { requestId, status, playbackHandle: body.playback_handle };
}
