import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { useFavoriteSyncService } from '@/relisten/realm/root_services';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/** Supplies app lifecycle signals to the long-lived favorites sync service. */
export function FavoriteSyncCoordinator() {
  const account = useAccountScope();
  const syncService = useFavoriteSyncService();
  const canMakeNetworkRequests = useShouldMakeNetworkRequests();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    syncService.start();
    return syncService.stop;
  }, [syncService]);

  useEffect(() => {
    syncService.updateEnvironment({
      account,
      appIsActive: appState === 'active',
      canMakeNetworkRequests,
    });
  }, [account, appState, canMakeNetworkRequests, syncService]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  return null;
}
