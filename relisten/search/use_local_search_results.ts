import { useDeferredValue, useMemo } from 'react';
import { useVisibleLibraryUserId } from '@/relisten/playlists/playlist_hooks';
import { useRealm } from '@/relisten/realm/schema';
import {
  EMPTY_LOCAL_RESULTS,
  searchLocal,
  type LocalNarrowing,
  type LocalSearchResults,
} from './search_local';

/**
 * "On this device" results for the field's text. The search reads Realm
 * synchronously, and the session renders every keystroke synchronously, so
 * run on the live text it would hold up every keystroke. It runs on a
 * deferred copy instead: the keystroke renders at once, and the results
 * follow in a lower-priority render.
 */
export function useLocalSearchResults(
  query: string,
  {
    enabled,
    narrowing,
    includePlaylists,
  }: { enabled: boolean; narrowing: LocalNarrowing; includePlaylists: boolean }
): LocalSearchResults {
  const realm = useRealm();
  const libraryUserId = useVisibleLibraryUserId();
  // Only deferred while the search runs; otherwise it stays constant, so
  // online typing doesn't pay for a second render.
  const deferredQuery = useDeferredValue(enabled ? query : '');

  return useMemo(
    () =>
      enabled
        ? searchLocal(realm, deferredQuery, { narrowing, includePlaylists, libraryUserId })
        : EMPTY_LOCAL_RESULTS,
    [deferredQuery, enabled, includePlaylists, libraryUserId, narrowing, realm]
  );
}
