import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useObject, useQuery, useRealm } from '@/relisten/realm/schema';
import {
  ActiveUserDataScope,
  ACTIVE_USER_DATA_SCOPE_KEY,
} from '@/relisten/realm/models/user_library/scope';
import { ScopedPlaybackHistoryEntry } from '@/relisten/realm/models/user_library/history';
import { UserDataSyncStatus } from '@/relisten/realm/models/user_library/sync';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { createUserLibrarySyncServices } from '@/relisten/user_library/user_library_sync_services';
import { UserLibrarySyncRunReason } from '@/relisten/user_library/user_library_sync_runner';

export function UserLibrarySyncBootstrap() {
  const realm = useRealm();
  const activeScope = useObject(ActiveUserDataScope, ACTIVE_USER_DATA_SCOPE_KEY, [
    'scopeId',
    'scopeKind',
  ]);
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();
  const services = useMemo(() => createUserLibrarySyncServices(realm), [realm]);
  const networkRef = useLatestRef(shouldMakeNetworkRequests);
  const pendingHistoryEntries = useQuery(
    ScopedPlaybackHistoryEntry,
    (query) =>
      activeScope
        ? query.filtered(
            'scopeId == $0 && syncStatus == $1',
            activeScope.scopeId,
            UserDataSyncStatus.Pending
          )
        : query.filtered('scopeId == $0', '__no_active_scope__'),
    [activeScope?.scopeId]
  );

  const triggerSync = useCallback(
    (reason: UserLibrarySyncRunReason) => {
      if (!networkRef.current) {
        return;
      }

      services.runner.runOnce(reason).then((result) => {
        if (result.status === 'failed') {
          console.warn('User-library sync failed', result.error);
        }
      });
    },
    [networkRef, services.runner]
  );

  useEffect(() => {
    triggerSync(activeScope ? 'scope-change' : 'mount');
  }, [activeScope?.scopeId, activeScope?.scopeKind, shouldMakeNetworkRequests, triggerSync]);

  useEffect(() => {
    if (pendingHistoryEntries.length > 0) {
      triggerSync('history');
    }
  }, [pendingHistoryEntries.length, triggerSync]);

  useEffect(() => {
    let previousState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = previousState === 'inactive' || previousState === 'background';
      previousState = nextState;

      if (nextState === 'active' && wasInactive) {
        triggerSync('foreground');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [triggerSync]);

  return null;
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
