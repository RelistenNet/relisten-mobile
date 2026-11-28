import { type Href, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useRelistenApi } from '@/relisten/api/context';
import { showToast } from '@/relisten/components/toast';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import { seedCatalogSearchArtist } from '@/relisten/realm/catalog_apply';
import { Artist } from '@/relisten/realm/models/artist';
import { ensureCatalogArtist } from '@/relisten/realm/models/artist_repo';
import { useRealm } from '@/relisten/realm/schema';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { type RelistenTabGroupSegment, useGroupSegment } from '@/relisten/util/routes';
import { log } from '@/relisten/util/logging';
import { searchTapTarget } from './search_routes';
import type { SearchCatalogRow } from './search_types';

const logger = log.extend('search');

/**
 * Opens a search result in the current tab's stack (or `tabOverride`'s), so
 * Back returns to the query, scope and scroll position. The row's artist is loaded first: a show
 * opens through `pushShow`, which reads the artist's source settings, and
 * every catalog path is keyed by the artist.
 */
export function useOpenSearchResult(tabOverride?: RelistenTabGroupSegment) {
  const realm = useRealm();
  const router = useRouter();
  const currentTab = useGroupSegment();
  // Add Tracks sits outside the tabs, so its Open full page names the playlist's tab.
  const tab = tabOverride ?? currentTab;
  const { apiClient } = useRelistenApi();
  const { pushShow } = usePushShowRespectingUserSettings();

  const loadArtist = useCallback(
    async (row: SearchCatalogRow): Promise<Artist | null> => {
      const { artist } = row;
      if (!artist) {
        return null;
      }

      try {
        realm.write(() => seedCatalogSearchArtist(realm, artist));
      } catch (error) {
        // The detail route still works from its own full catalog response.
        logger.warn(
          `Search snapshot could not be cached: ${error instanceof Error ? error.name : 'unknown'}`
        );
      }

      const uuid = decodeUuidCatalogId(artist.id, 'artist');
      await ensureCatalogArtist(realm, apiClient, uuid);
      return realm.objectForPrimaryKey(Artist, uuid);
    },
    [apiClient, realm]
  );

  // Ignore a second tap while the first one loads its artist.
  const opening = useRef(false);

  return useCallback(
    (row: SearchCatalogRow) =>
      followSearchTap(row, opening, {
        loadArtist,
        push: (href) => router.push(href),
        pushShow: (artist, showUuid) => pushShow({ artist, showUuid, overrideGroupSegment: tab }),
        tab,
      }),
    [loadArtist, pushShow, router, tab]
  );
}

/**
 * Follows one tap. Outside the hook because the React Compiler can't compile
 * a `finally`, which releases the in-flight flag however the tap ends.
 */
async function followSearchTap(
  row: SearchCatalogRow,
  opening: { current: boolean },
  {
    loadArtist,
    push,
    pushShow,
    tab,
  }: {
    loadArtist: (row: SearchCatalogRow) => Promise<Artist | null>;
    push: (href: Href) => void;
    pushShow: (artist: Artist, showUuid: string) => void;
    tab: RelistenTabGroupSegment;
  }
) {
  if (opening.current) {
    return;
  }

  opening.current = true;
  try {
    const artist = await loadArtist(row);
    const target = searchTapTarget(row, artist, tab);
    if (target.kind === 'push') {
      push(target.href);
    } else if (artist) {
      // A show always has its artist; `searchTapTarget` throws otherwise.
      pushShow(artist, target.showUuid);
    }
  } catch (error) {
    logger.warn(`Search result could not open: ${error instanceof Error ? error.name : 'unknown'}`);
    showToast('Couldn’t open that result. Check your connection and try again.', {
      tone: 'warning',
    });
  } finally {
    opening.current = false;
  }
}
