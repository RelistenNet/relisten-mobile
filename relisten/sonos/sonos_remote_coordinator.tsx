import { useEffect } from 'react';
import { AppState } from 'react-native';
import {
  useAccountScope,
  useAccountScopeSource,
  useAccountsApiClient,
} from '@/relisten/accounts/account_context';
import { sonosRemote, useSonosRemote } from './sonos_remote';

const POLL_INTERVAL_MS = 4000;

/**
 * Keeps remote Sonos playback in step with the account and the room. Signed
 * in, it looks for active playback on launch and whenever the app returns,
 * and re-reads the room every few seconds while remote controls show and the
 * app is in front. Signing out ends remote control.
 */
export function SonosRemoteCoordinator() {
  const scope = useAccountScope();
  const scopeSource = useAccountScopeSource();
  const api = useAccountsApiClient();
  const signedIn = scope.isAuthenticated;
  const remote = useSonosRemote();
  const active = remote.kind !== 'none';

  useEffect(() => {
    sonosRemote.bind(signedIn ? api : undefined, () => scopeSource.isCurrent(scope));
    if (!signedIn) {
      return;
    }
    void sonosRemote.discover();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void sonosRemote.discover();
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
