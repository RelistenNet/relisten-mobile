import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAccountScope, useAccountsApiClient } from '@/relisten/accounts/account_context';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useSearchBoostArtistIds } from './search_boosts';
import { fetchSearch } from './search_client';
import { SearchSession, searchAccountKey, type SearchSessionState } from './search_session';
import type { SearchMode } from './search_types';

/**
 * The search session a screen renders from: its inputs, the latest results
 * for the signed-in account, and whether a request is pending. The session
 * lives as long as the screen, so Back returns to the same query and scope.
 *
 * `playlistArtistUuids` ranks the destination playlist's artists first in
 * Add Tracks; pass a stable array.
 */
export function useSearchSession(
  mode: SearchMode,
  playlistArtistUuids?: readonly string[]
): { session: SearchSession; state: SearchSessionState } {
  const api = useAccountsApiClient();
  const scope = useAccountScope();
  const online = useShouldMakeNetworkRequests();
  const boostArtistIds = useSearchBoostArtistIds(playlistArtistUuids);
  const [session] = useState(
    () =>
      new SearchSession(mode, (request, signedIn, signal) =>
        fetchSearch(api, request, signedIn, signal)
      )
  );
  const accountKey = searchAccountKey(scope);

  useEffect(() => {
    session.setContext({
      accountKey,
      signedIn: scope.isAuthenticated,
      online,
      boostArtistIds,
    });
  }, [session, accountKey, scope.isAuthenticated, online, boostArtistIds]);

  useEffect(() => () => session.dispose(), [session]);

  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { session, state };
}
