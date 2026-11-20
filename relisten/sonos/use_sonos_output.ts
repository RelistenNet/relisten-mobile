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
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
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
import { handoffRequest, type SonosHandoffOutcome } from './sonos_handoff';
import { sonosRemote } from './sonos_remote';

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

/** The handoff the listener started from this sheet, by room. */
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
  const [handoff, setHandoff] = useState<
    (SonosHandoffState & { generation: number }) | undefined
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
   * Moves the queue to `group`. Phone playback pauses only now, the explicit
   * choice; it resumes if Sonos refuses before taking over, and stays paused
   * when the room plays or the outcome is uncertain, so music never plays in
   * two places.
   */
  const playOn = useCallback(
    async (group: SonosGroup) => {
      const capture = scope.capture();
      if (!capture.isAuthenticated || capture.generation !== generation) {
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

      const wasPlaying = player.state === RelistenPlaybackState.Playing;
      player.pause();
      setHandoff({ groupId: group.id, phase: 'connecting', generation: capture.generation });

      // Once the room takes the queue, the player plays through it.
      const outcome = await sonosRemote.handOff(request, group.name);
      if (!scope.isCurrent(capture)) {
        return;
      }
      if (outcome.kind === 'refused' && wasPlaying) {
        player.resume();
      }
      if (outcome.kind === 'refused' && outcome.reconnect) {
        setConnection({ kind: 'notLinked' });
      } else if (outcome.kind === 'uncertain' && mounted.current) {
        void refresh();
      }
      if (mounted.current) {
        setHandoff({ groupId: group.id, phase: 'done', outcome, generation: capture.generation });
      }
    },
    [generation, player, refresh, scope]
  );

  const hasQueue = currentTrack !== undefined;

  return {
    connection,
    handoff: handoff?.generation === generation ? handoff : undefined,
    hasQueue,
    refresh,
    connect,
    playOn,
  };
}
