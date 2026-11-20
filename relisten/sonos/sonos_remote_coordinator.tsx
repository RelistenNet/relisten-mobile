import { useEffect } from 'react';
import { AppState } from 'react-native';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import {
  useAccountScope,
  useAccountScopeSource,
  useAccountsApiClient,
} from '@/relisten/accounts/account_context';
import { useRelistenApi } from '@/relisten/api/context';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import { isRemotePlayback } from '@/relisten/player/shared_state';
import { useRealm } from '@/relisten/realm/schema';
import { queueTracksForRoom } from './sonos_queue_tracks';
import { sonosRemote, useSonosRemote } from './sonos_remote';
import { sonosSession } from './sonos_session';

const POLL_INTERVAL_MS = 4000;

/** A remembered room is restored only when nothing else is playing. */
const canRestoreRoom = () =>
  !isRemotePlayback() && RelistenPlayer.DEFAULT_INSTANCE.state !== RelistenPlaybackState.Playing;

/**
 * Keeps Sonos playback in step with the account and the room. Signed in, it
 * restores the room this device was playing on at launch and re-reads it
 * whenever the app returns, and re-reads it every few seconds while a room
 * plays and the app is in front. Signing out ends remote control.
 */
export function SonosRemoteCoordinator() {
  const scope = useAccountScope();
  const scopeSource = useAccountScopeSource();
  const api = useAccountsApiClient();
  const realm = useRealm();
  const { apiClient: catalogApi } = useRelistenApi();
  const signedIn = scope.isAuthenticated;
  const active = useSonosRemote().kind !== 'none';

  useEffect(
    () =>
      sonosSession.start((entries, phoneTracks) =>
        queueTracksForRoom(realm, catalogApi, entries, phoneTracks)
      ),
    [catalogApi, realm]
  );

  useEffect(() => {
    sonosRemote.bind(
      signedIn ? api : undefined,
      () => scopeSource.isCurrent(scope),
      scope.userId ?? undefined
    );
    if (!signedIn) {
      return;
    }
    void sonosRemote.discover(canRestoreRoom);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void sonosRemote.discover(canRestoreRoom);
      }
    });
    return () => subscription.remove();
  }, [api, scope, scopeSource, signedIn]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        void sonosRemote.refresh();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  return null;
}
