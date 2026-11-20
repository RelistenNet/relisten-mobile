import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';

/**
 * The account service's Sonos routes. Sonos credentials stay on the server;
 * the app sends its own account token and works with rooms and handoffs.
 *
 * The routes answer 404 when the server has no Sonos configuration, which the
 * app treats as the feature being unavailable rather than as an error.
 */
const BASE = '/v1/integrations/sonos';

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

export interface SonosHandoffReceipt {
  requestId: string;
  status: SonosHandoffStatus;
  /** The room's last reported playback state, as Sonos names it, once it reports one. */
  playbackEventState: string | null;
  /** Addresses the room's playback for Now Playing and Play/Pause, once the queue loads. */
  playbackHandle: string | null;
}

export interface SonosHandoffRequest {
  /** Fresh for each explicit handoff, reused with the identical body on retry. */
  request_id: string;
  group_id: string;
  /** One typed track ID per queue occurrence, duplicates included. */
  track_ids: string[];
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
  const body = await api.request<{ linked?: unknown }>(`${BASE}/connection`);
  return body?.linked === true;
}

/** Starts linking the account; the URL opens Sonos sign-in in the system browser. */
export async function beginSonosConnect(api: AuthorizedAccountsApiClient): Promise<string> {
  const body = await api.request<{ authorization_url?: unknown }>(
    `${BASE}/connect?return_to=mobile`,
    {
      method: 'POST',
    }
  );
  if (typeof body?.authorization_url !== 'string') {
    throw new Error('The Sonos sign-in link is missing.');
  }
  return body.authorization_url;
}

export async function fetchSonosGroups(api: AuthorizedAccountsApiClient): Promise<SonosGroup[]> {
  const body = await api.request<unknown>(`${BASE}/groups`);
  if (!Array.isArray(body)) {
    throw new Error('The Sonos rooms response is invalid.');
  }
  return body.flatMap((group) =>
    typeof group?.id === 'string' && typeof group.name === 'string'
      ? [{ householdId: String(group.household_id ?? ''), id: group.id, name: group.name }]
      : []
  );
}

export async function startSonosHandoff(
  api: AuthorizedAccountsApiClient,
  request: SonosHandoffRequest
): Promise<SonosHandoffReceipt> {
  return parseReceipt(
    await api.request<unknown>(`${BASE}/handoffs`, {
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
    await api.request<unknown>(`${BASE}/handoffs/${encodeURIComponent(requestId)}`),
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
    playback_event_state?: unknown;
    playback_handle?: unknown;
  } | null;
  if (
    body?.request_id !== requestId ||
    !STATUSES.includes(body.status as SonosHandoffStatus) ||
    (body.status === 'loaded' &&
      (typeof body.playback_handle !== 'string' || !PLAYBACK_HANDLE.test(body.playback_handle)))
  ) {
    throw new Error('The Sonos handoff response is invalid.');
  }
  return {
    requestId,
    status: body.status as SonosHandoffStatus,
    playbackEventState:
      typeof body.playback_event_state === 'string' ? body.playback_event_state : null,
    playbackHandle: typeof body.playback_handle === 'string' ? body.playback_handle : null,
  };
}
