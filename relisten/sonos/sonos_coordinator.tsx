import { useEffect, useSyncExternalStore } from 'react';
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
import { OfflineModeSetting } from '@/relisten/realm/models/user_settings';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { useRealm } from '@/relisten/realm/schema';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { queueTracksForRoom } from './sonos_queue_tracks';
import { sonosRoom, useSonosRoomName } from './sonos_room_store';
import { sonosSession } from './sonos_session';

const POLL_INTERVAL_MS = 4000;
/**
 * How long the network must stay gone before playback leaves the room. A
 * switch from Wi-Fi to cellular can report no network for a moment, and
 * leaving forgets the room, which plays on.
 */
const NETWORK_LOSS_GRACE_MS = 10_000;

/** A remembered room is restored only when nothing else is playing. */
const canRestoreRoom = () =>
  !isRemotePlayback() && RelistenPlayer.DEFAULT_INSTANCE.state !== RelistenPlaybackState.Playing;

/** The handle of the room that has been read; a new one means its volume should be read. */
const playingHandle = () => {
  const room = sonosRoom.getState();
  return room.kind === 'active' ? room.playback.handle : undefined;
};

/**
 * Keeps Sonos playback in step with the account and the room. Signed in, it
 * restores the room this device was playing on at launch and re-reads it
 * whenever the app returns, and re-reads it every few seconds while a room
 * plays and the app is in front. It reads a newly playing room's volume
 * straight away, so Play On shows it on opening. Signing out ends remote
 * control. In offline mode, or without a network, it reads nothing, and
 * playback moves back to the phone: at once for offline mode, the listener's
 * choice, and after `NETWORK_LOSS_GRACE_MS` for a lost network.
 */
export function SonosCoordinator() {
  const scope = useAccountScope();
  const scopeSource = useAccountScopeSource();
  const api = useAccountsApiClient();
  const realm = useRealm();
  const { apiClient: catalogApi } = useRelistenApi();
  const signedIn = scope.isAuthenticated;
  const online = useShouldMakeNetworkRequests();
  const offlineMode =
    useUserSettings().offlineModeWithDefault() === OfflineModeSetting.AlwaysOffline;
  const active = useSonosRoomName() !== undefined;
  const handle = useSyncExternalStore(sonosRoom.subscribe, playingHandle, playingHandle);

  useEffect(
    () =>
      sonosSession.start((entries, phoneTracks) =>
        queueTracksForRoom(realm, catalogApi, entries, phoneTracks)
      ),
    [catalogApi, realm]
  );

  useEffect(() => {
    sonosRoom.bind(
      signedIn ? api : undefined,
      () => scopeSource.isCurrent(scope),
      scope.userId ?? undefined
    );
  }, [api, scope, scopeSource, signedIn]);

  useEffect(() => {
    if (!signedIn || !online) {
      return;
    }
    void sonosRoom.discover(canRestoreRoom);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void sonosRoom.discover(canRestoreRoom);
      }
    });
    return () => subscription.remove();
    // Every change of the account scope tries again: on a cold launch the first
    // try runs before the account's token is ready and fails, and a new
    // account restores its own room.
  }, [api, online, scope, signedIn]);

  useEffect(() => {
    if (online) {
      return;
    }
    const timer = setTimeout(
      () => sonosSession.leaveRoomOffline(),
      offlineMode ? 0 : NETWORK_LOSS_GRACE_MS
    );
    return () => clearTimeout(timer);
  }, [offlineMode, online]);

  useEffect(() => {
    if (!active || !online) {
      return;
    }
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        void sonosRoom.refresh();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, online]);

  useEffect(() => {
    if (handle && online) {
      void sonosRoom.refreshVolume();
    }
  }, [handle, online]);

  return null;
}
