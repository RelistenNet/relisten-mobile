import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { claimUnownedPlaylists } from '@/relisten/playlists/sync/playlist_sync_state';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { usePlaylistSyncService } from '@/relisten/realm/root_services';
import { useRealm } from '@/relisten/realm/schema';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/**
 * Connects playlist sync to the account and app lifecycle. Signing in saves
 * the device's playlists to that account; going to the background sends
 * pending edits at once rather than after the quiet period.
 */
export function PlaylistSyncCoordinator() {
  const realm = useRealm();
  const account = useAccountScope();
  const service = usePlaylistSyncService();
  const canMakeNetworkRequests = useShouldMakeNetworkRequests();
  const [appState, setAppState] = useState(AppState.currentState);
  const userId = account.isAuthenticated ? account.userId : null;

  useEffect(() => {
    service.start();
    return () => service.stop();
  }, [service]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const claimed = realm.write(() => claimUnownedPlaylists(realm, userId));
    if (claimed > 0) {
      showPlaylistToast('Saving your playlists to your account.');
      service.flush();
    }
  }, [realm, service, userId]);

  useEffect(() => {
    service.updateEnvironment({
      account,
      appIsActive: appState === 'active',
      canMakeNetworkRequests,
    });
  }, [account, appState, canMakeNetworkRequests, service]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        service.flush();
      }
      setAppState(next);
    });
    return () => subscription.remove();
  }, [service]);

  return null;
}
