import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useObject, useRealm } from '@/relisten/realm/schema';
import {
  ActiveUserDataScope,
  ACTIVE_USER_DATA_SCOPE_KEY,
} from '@/relisten/realm/models/user_library/scope';
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
