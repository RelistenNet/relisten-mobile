import {
  AccountsApiError,
  type AuthorizedAccountsApiClient,
} from '@/relisten/accounts/api/accounts_api_client';
import {
  fetchSonosHandoff,
  needsSonosReconnect,
  type SonosHandoffReceipt,
  type SonosHandoffRequest,
  startSonosHandoff,
} from './sonos_api';
import { type QueueOccurrence, sonosQueueEntry, wireOccurrences } from './sonos_playback';

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
 * - `cancelled`: the listener chose the phone, or the phone went offline.
 *   Whoever cancelled decides whether the phone plays
 *   (`SonosSession.transferToPhone`, `leaveRoomOffline`).
 *   If the room takes the queue anyway, the store pauses it
 *   (`SonosRoomStore.abandonHandoff`).
 * `reconnect` means the account's Sonos link has to be made again.
 */
export type SonosHandoffOutcome =
  | { kind: 'playing'; handle: string }
  | { kind: 'refused'; message: string; reconnect: boolean }
  | { kind: 'uncertain'; reconnect: boolean }
  | { kind: 'cancelled' };

/**
 * Whether the handoff's starter may resume the phone. Only a refusal proves
 * the room never took the queue; after a cancel, the canceller decides; after
 * any other outcome the phone stays paused, so the queue never plays in two
 * places.
 */
export function phoneMayResumeAfter(outcome: SonosHandoffOutcome): boolean {
  return outcome.kind === 'refused';
}

/** Whether the outcome means the account's Sonos link has to be made again. */
export function handoffNeedsReconnect(outcome: SonosHandoffOutcome): boolean {
  return (outcome.kind === 'refused' || outcome.kind === 'uncertain') && outcome.reconnect;
}

/** What to tell the user when a handoff's outcome is uncertain. */
export const HANDOFF_UNCONFIRMED_MESSAGE =
  'Sonos didn’t confirm. Check the room before trying again.';

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
  tracks: readonly QueueOccurrence[];
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
    occurrences: wireOccurrences(tracks.map(sonosQueueEntry)),
    start_index: startIndex,
    position_millis: Math.max(0, Math.round(positionSeconds * 1000)),
  };
}

export interface HandoffTiming {
  wait: (ms: number) => Promise<void>;
  /** Pause between status checks while the room hasn't confirmed. */
  pollIntervalMs?: number;
  /** Status checks before the outcome is left uncertain. */
  maxPolls?: number;
  /** Times a lost or retryable submission is sent again. */
  maxRetries?: number;
}

/**
 * Sends the handoff and follows it until the room confirms or the checks run
 * out. `isCurrent` turns false when the account changes; the handoff is then
 * left uncertain rather than followed under another account.
 */
export async function runSonosHandoff(
  api: AuthorizedAccountsApiClient,
  request: SonosHandoffRequest,
  isCurrent: () => boolean,
  { wait, pollIntervalMs = 1000, maxPolls = 45, maxRetries = 2 }: HandoffTiming
): Promise<SonosHandoffOutcome> {
  const submitted = await submit(api, request, isCurrent, { wait, pollIntervalMs, maxRetries });
  if (submitted.kind !== 'submitted') {
    return submitted;
  }

  const settled = await followUntilSettled(api, submitted.receipt, isCurrent, {
    wait,
    pollIntervalMs,
    maxPolls,
  });
  return settled ? outcomeOf(settled) : { kind: 'uncertain', reconnect: false };
}

/**
 * Sends the request, retrying lost responses and retryable failures with the
 * same request ID and body, which the server treats as the same handoff. If
 * every attempt is lost, a status check tells whether one of them arrived.
 */
async function submit(
  api: AuthorizedAccountsApiClient,
  request: SonosHandoffRequest,
  isCurrent: () => boolean,
  { wait, pollIntervalMs, maxRetries }: Required<Omit<HandoffTiming, 'maxPolls'>>
): Promise<{ kind: 'submitted'; receipt: SonosHandoffReceipt } | SonosHandoffOutcome> {
  for (let attempt = 0; ; attempt += 1) {
    if (!isCurrent()) {
      return { kind: 'uncertain', reconnect: false };
    }
    try {
      return { kind: 'submitted', receipt: await startSonosHandoff(api, request) };
    } catch (error) {
      if (!(error instanceof AccountsApiError) || !error.retryable) {
        return isDefiniteRefusal(error, attempt)
          ? refusal(error)
          : { kind: 'uncertain', reconnect: false };
      }
      if (attempt < maxRetries) {
        await wait(pollIntervalMs);
        continue;
      }
      // Out of retries: fall through to ask whether any attempt arrived.
    }

    // Every attempt failed in a way that may have reached the server.
    if (!isCurrent()) {
      return { kind: 'uncertain', reconnect: false };
    }
    try {
      return { kind: 'submitted', receipt: await fetchSonosHandoff(api, request.request_id) };
    } catch {
      return { kind: 'uncertain', reconnect: false };
    }
  }
}

/**
 * Whether a failed submission proves the room never took the queue. Only a
 * client error on the first attempt does: after a lost attempt, the server may
 * have started the handoff, and a later 4xx (a busy room, say) can describe
 * that handoff rather than a refusal. A malformed success is never a refusal.
 */
function isDefiniteRefusal(error: unknown, attempt: number): error is AccountsApiError {
  return (
    attempt === 0 &&
    error instanceof AccountsApiError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500
  );
}

/** Re-checks a `dispatching` handoff; undefined when it never settles in time. */
async function followUntilSettled(
  api: AuthorizedAccountsApiClient,
  receipt: SonosHandoffReceipt,
  isCurrent: () => boolean,
  { wait, pollIntervalMs, maxPolls }: Required<Omit<HandoffTiming, 'maxRetries'>>
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
      return { kind: 'playing', handle: receipt.playbackHandle };
    case 'failed':
      return { kind: 'refused', message: 'Sonos couldn’t start playing.', reconnect: false };
    case 'revoked':
      // The link ended during the handoff, which may already have reached the room.
      return { kind: 'uncertain', reconnect: true };
    case 'dispatching':
    case 'evicted':
    case 'interrupted':
      return { kind: 'uncertain', reconnect: false };
  }
}

/** A failure that guarantees nothing reached the room. */
function refusal(error: AccountsApiError): SonosHandoffOutcome {
  if (needsSonosReconnect(error)) {
    return {
      kind: 'refused',
      message: 'Your Sonos connection needs to be renewed. Connect Sonos again.',
      reconnect: true,
    };
  }
  if (error.code === 'sonos_handoff_busy') {
    return {
      kind: 'refused',
      message: 'A handoff is still finishing in that room. Try again shortly.',
      reconnect: false,
    };
  }
  if (error.status === 422) {
    return {
      kind: 'refused',
      message:
        error.code === 'sonos_start_position_invalid'
          ? 'The starting position is past the end of the track. Try again.'
          : 'Some tracks in your queue can’t play on Sonos.',
      reconnect: false,
    };
  }
  if (error.status === 404) {
    return { kind: 'refused', message: 'That room isn’t available anymore.', reconnect: false };
  }
  return { kind: 'refused', message: 'Couldn’t reach Sonos. Try again.', reconnect: false };
}
