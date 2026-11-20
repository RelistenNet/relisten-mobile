import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import { formatUuidTypedId } from '@/relisten/util/typed_uuid_id';
import {
  fetchSonosHandoff,
  needsSonosReconnect,
  type SonosHandoffReceipt,
  type SonosHandoffRequest,
  startSonosHandoff,
} from './sonos_api';

/**
 * Moving the phone's queue to a Sonos room.
 *
 * The server loads the room with the effective queue (duplicates included),
 * starting at the playing occurrence and position. A handoff can end three
 * ways that matter to the phone:
 * - `playing`: the room took the queue; the phone stays paused.
 * - `refused`: nothing reached the room, so the phone resumes what it was doing.
 * - `uncertain`: the room may or may not have taken over. The phone stays
 *   paused rather than risk playing in two places.
 */
export type SonosHandoffOutcome =
  | { kind: 'playing'; receipt: SonosHandoffReceipt }
  | { kind: 'refused'; message: string; reconnect: boolean }
  | { kind: 'uncertain' };

/** One queue occurrence, as the player holds it. */
export interface HandoffQueueTrack {
  /** The occurrence's identity; the same recording can appear more than once. */
  identifier: string;
  sourceTrack: { uuid: string };
}

/**
 * The request for the queue as it plays now. The start is found by the
 * playing occurrence, not the recording, so a track queued twice starts at
 * the right one. Returns undefined when nothing is playing.
 */
export function handoffRequest({
  requestId,
  groupId,
  tracks,
  currentIdentifier,
  positionSeconds,
}: {
  requestId: string;
  groupId: string;
  tracks: readonly HandoffQueueTrack[];
  currentIdentifier: string | undefined;
  positionSeconds: number;
}): SonosHandoffRequest | undefined {
  const startIndex = tracks.findIndex((track) => track.identifier === currentIdentifier);
  if (startIndex < 0) {
    return undefined;
  }

  return {
    request_id: requestId,
    group_id: groupId,
    track_ids: tracks.map((track) => formatUuidTypedId('track', track.sourceTrack.uuid)),
    start_index: startIndex,
    position_millis: Math.max(0, Math.round(positionSeconds * 1000)),
  };
}

export interface HandoffTiming {
  wait: (ms: number) => Promise<void>;
  isCurrent?: () => boolean;
  /** Pause between status checks while the room hasn't confirmed. */
  pollIntervalMs?: number;
  /** Status checks before the outcome is left uncertain. */
  maxPolls?: number;
  /** Times a lost or retryable submission is sent again. */
  maxRetries?: number;
}

/** Sends the handoff and follows it until the room confirms or the checks run out. */
export async function runSonosHandoff(
  api: AuthorizedAccountsApiClient,
  request: SonosHandoffRequest,
  {
    wait,
    isCurrent = () => true,
    pollIntervalMs = 1000,
    maxPolls = 45,
    maxRetries = 2,
  }: HandoffTiming
): Promise<SonosHandoffOutcome> {
  const submitted = await submit(api, request, { wait, isCurrent, pollIntervalMs, maxRetries });
  if (!isReceipt(submitted)) {
    return submitted;
  }

  const settled = await followUntilSettled(api, submitted, {
    wait,
    isCurrent,
    pollIntervalMs,
    maxPolls,
  });
  return settled ? outcomeOf(settled) : { kind: 'uncertain' };
}

/**
 * Sends the request, retrying lost responses and retryable failures with the
 * same request ID and body, which the server treats as the same handoff. If
 * every attempt is lost, a status check tells whether one of them arrived.
 */
async function submit(
  api: AuthorizedAccountsApiClient,
  request: SonosHandoffRequest,
  { wait, isCurrent, pollIntervalMs, maxRetries }: Required<Omit<HandoffTiming, 'maxPolls'>>
): Promise<SonosHandoffReceipt | SonosHandoffOutcome> {
  for (let attempt = 0; ; attempt += 1) {
    if (!isCurrent()) {
      return { kind: 'uncertain' };
    }
    try {
      return await startSonosHandoff(api, request);
    } catch (error) {
      if (!(error instanceof AccountsApiError) || !error.retryable) {
        // A malformed success can arrive after the room has changed.
        return attempt === 0 &&
          error instanceof AccountsApiError &&
          error.status !== null &&
          error.status >= 400 &&
          error.status < 500
          ? refusal(error)
          : { kind: 'uncertain' };
      }
      if (attempt < maxRetries) {
        await wait(pollIntervalMs);
        continue;
      }
    }

    // Every attempt failed in a way that may have reached the server.
    if (!isCurrent()) {
      return { kind: 'uncertain' };
    }
    try {
      return await fetchSonosHandoff(api, request.request_id);
    } catch {
      return { kind: 'uncertain' };
    }
  }
}

/** Re-checks a `dispatching` handoff; undefined when it never settles in time. */
async function followUntilSettled(
  api: AuthorizedAccountsApiClient,
  receipt: SonosHandoffReceipt,
  { wait, isCurrent, pollIntervalMs, maxPolls }: Required<Omit<HandoffTiming, 'maxRetries'>>
): Promise<SonosHandoffReceipt | undefined> {
  let current = receipt;
  for (let poll = 0; current.status === 'dispatching'; poll += 1) {
    if (poll >= maxPolls) {
      return undefined;
    }
    await wait(pollIntervalMs);
    if (!isCurrent()) {
      return undefined;
    }
    try {
      current = await fetchSonosHandoff(api, receipt.requestId);
    } catch (error) {
      // A dropped check says nothing about the room; an expired or unknown one ends the wait.
      if (!(error instanceof AccountsApiError) || !error.retryable) {
        return undefined;
      }
    }
  }
  return isCurrent() ? current : undefined;
}

function outcomeOf(receipt: SonosHandoffReceipt): SonosHandoffOutcome {
  switch (receipt.status) {
    case 'loaded':
      return { kind: 'playing', receipt };
    case 'failed':
      return { kind: 'refused', message: 'Sonos couldn’t start playing.', reconnect: false };
    case 'revoked':
    case 'dispatching':
    case 'evicted':
    case 'interrupted':
      return { kind: 'uncertain' };
  }
}

/** A failure that guarantees nothing reached the room. */
function refusal(error: unknown): SonosHandoffOutcome {
  if (needsSonosReconnect(error)) {
    return {
      kind: 'refused',
      message: 'Your Sonos connection needs to be renewed. Connect Sonos again.',
      reconnect: true,
    };
  }
  if (error instanceof AccountsApiError && error.code === 'sonos_handoff_busy') {
    return {
      kind: 'refused',
      message: 'A handoff is still finishing in that room. Try again shortly.',
      reconnect: false,
    };
  }
  if (error instanceof AccountsApiError && error.status === 422) {
    return {
      kind: 'refused',
      message:
        error.code === 'sonos_start_position_invalid'
          ? 'The starting position is past the end of the track. Try again.'
          : 'Some tracks in your queue can’t play on Sonos.',
      reconnect: false,
    };
  }
  if (error instanceof AccountsApiError && error.status === 404) {
    return {
      kind: 'refused',
      message: 'That room isn’t available anymore.',
      reconnect: false,
    };
  }
  return { kind: 'refused', message: 'Couldn’t reach Sonos. Try again.', reconnect: false };
}

function isReceipt(value: SonosHandoffReceipt | SonosHandoffOutcome): value is SonosHandoffReceipt {
  return 'requestId' in value;
}
