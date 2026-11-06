import { UserFavorite } from '@/relisten/realm/models/library';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import {
  useFavoriteSyncService,
  useFavoriteMetadataHydrator,
  useFavoriteRepository,
} from '@/relisten/realm/root_services';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/** Supplies app lifecycle signals to the long-lived favorites sync service. */
export function FavoriteSyncCoordinator() {
  const account = useAccountScope();
  const syncService = useFavoriteSyncService();
  const hydrator = useFavoriteMetadataHydrator();
  const repository = useFavoriteRepository();
  const canMakeNetworkRequests = useShouldMakeNetworkRequests();
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    syncService.start();
    return () => {
      syncService.stop();
    };
  }, [syncService]);

  useEffect(() => {
    syncService.updateEnvironment({
      account,
      appIsActive: appState === 'active',
      canMakeNetworkRequests,
    });
  }, [account, appState, canMakeNetworkRequests, syncService]);

  useEffect(() => {
    if (appState !== 'active' || !canMakeNetworkRequests) return;
    const favorites = repository.realm.objects(UserFavorite);
    const refresh = () => {
      void hydrator.refresh();
    };
    // Realm delivers an initial notification as well as later membership changes.
    favorites.addListener(refresh, ['scopeId', 'targetKind', 'targetId', 'effectivePresent']);
    return () => {
      if (!repository.realm.isClosed) favorites.removeListener(refresh);
    };
  }, [repository, hydrator, account.scopeId, account.generation, appState, canMakeNetworkRequests]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  return null;
}
