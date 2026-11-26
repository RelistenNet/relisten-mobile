import { randomUUID } from 'expo-crypto';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  useAccount,
  useAccountsApiClient,
  useAccountScope,
  useAccountScopeSource,
} from '@/relisten/accounts/account_context';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import {
  beginSonosConnect,
  fetchSonosGroups,
  fetchSonosLinked,
  isSonosUnavailable,
  needsSonosReconnect,
  SONOS_CALLBACK_URL,
  type SonosGroup,
} from './sonos_api';
import { handoffNeedsReconnect, handoffRequest, type SonosHandoffOutcome } from './sonos_handoff';
import { sonosRoom, useSonosHandoffInFlight } from './sonos_room_store';
import { sonosSession } from './sonos_session';

/**
 * What the Play on sheet can show for Sonos:
 * - `signedOut`: Sonos links to an account, so the listener signs in first.
 * - `unavailable`: this server offers no Sonos integration; the section hides.
 * - `notLinked`: the account isn't linked; the sheet offers Connect Sonos.
 * - `linked`: rooms are listed (or still loading, or failed to load).
 */
export type SonosConnection =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'unavailable' }
  | { kind: 'notLinked' }
  | { kind: 'linked'; groups: SonosGroup[] | undefined; error?: string }
  | { kind: 'error'; message: string };

/**
 * A room's handoff as the sheet shows it: still connecting (from any sheet
 * this run, since the store holds it), or how the one started here ended.
 */
export type SonosHandoffState =
  | { groupId: string; phase: 'connecting' }
  | { groupId: string; phase: 'done'; outcome: SonosHandoffOutcome };

/**
 * Sonos for the Play on sheet. It reads the account's link and rooms when the
 * sheet opens and again when the app returns to the foreground, which is how
 * it notices a link finished in the browser.
 */
export function useSonosOutput() {
  const account = useAccount();
  const api = useAccountsApiClient();
  const scope = useAccountScopeSource();
  const { generation } = useAccountScope();
  const player = useRelistenPlayer();
  const currentTrack = useRelistenPlayerCurrentTrack();
  const signedIn = account.status === 'signedIn';
  const [connection, setConnection] = useState<SonosConnection>({ kind: 'loading' });
  const inFlight = useSonosHandoffInFlight();
  const [finished, setFinished] = useState<
    { groupId: string; outcome: SonosHandoffOutcome; generation: number } | undefined
  >();
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!signedIn) {
      setConnection({ kind: 'signedOut' });
      return;
    }

    try {
      if (!(await fetchSonosLinked(api))) {
        setConnection({ kind: 'notLinked' });
        return;
      }
      setConnection((current) =>
        current.kind === 'linked' ? current : { kind: 'linked', groups: undefined }
      );
      const groups = await fetchSonosGroups(api);
      if (mounted.current) {
        setConnection({ kind: 'linked', groups });
      }
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      if (isSonosUnavailable(error)) {
        setConnection({ kind: 'unavailable' });
      } else if (needsSonosReconnect(error)) {
        setConnection({ kind: 'notLinked' });
      } else {
        setConnection({ kind: 'error', message: 'Couldn’t reach Sonos.' });
      }
    }
  }, [api, signedIn]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [refresh]);

  /** Opens Sonos sign-in in the browser; the link shows up when the app returns. */
  const connect = useCallback(async () => {
    try {
      await openAuthSessionAsync(await beginSonosConnect(api), SONOS_CALLBACK_URL);
      if (mounted.current) {
        await refresh();
      }
    } catch {
      setConnection({ kind: 'error', message: 'Couldn’t start connecting Sonos.' });
    }
  }, [api, refresh]);

  /**
   * Moves the queue to `group` (`SonosSession.moveQueueToRoom`, which also
   * decides whether the phone plays again) and shows how it went. Nothing
   * happens while another handoff is still settling.
   */
  const playOn = useCallback(
    async (group: SonosGroup) => {
      // A sheet rendered for an earlier account can't start a handoff for this one.
      const capture = scope.capture();
      if (
        !capture.isAuthenticated ||
        capture.generation !== generation ||
        sonosRoom.getHandoffInFlight()
      ) {
        return;
      }
      const request = handoffRequest({
        requestId: randomUUID(),
        groupId: group.id,
        tracks: player.queue.orderedTracks,
        currentIdentifier: player.queue.currentTrack?.identifier,
        positionSeconds: player.progress?.elapsed ?? 0,
      });
      if (!request) {
        return;
      }

      setFinished(undefined);

      // Once the room takes the queue, the store controls it and the session
      // routes the player there, so this phone's controls reach the room.
      const outcome = await sonosSession.moveQueueToRoom(request, group.name);
      if (!scope.isCurrent(capture)) {
        return;
      }
      if (handoffNeedsReconnect(outcome)) {
        setConnection({ kind: 'notLinked' });
      } else if (outcome.kind === 'uncertain' && mounted.current) {
        void refresh();
      }
      if (mounted.current) {
        setFinished({ groupId: group.id, outcome, generation: capture.generation });
      }
    },
    [generation, player, refresh, scope]
  );

  const hasQueue = currentTrack !== undefined;

  const handoff: SonosHandoffState | undefined = inFlight
    ? { groupId: inFlight.groupId, phase: 'connecting' }
    : finished?.generation === generation
      ? { groupId: finished.groupId, phase: 'done', outcome: finished.outcome }
      : undefined;

  return {
    connection,
    handoff,
    hasQueue,
    refresh,
    connect,
    playOn,
  };
}
