import { type Href, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useRelistenApi } from '@/relisten/api/context';
import { showToast } from '@/relisten/components/toast';
import { Artist } from '@/relisten/realm/models/artist';
import {
  ensureCatalogArtist,
  ensureCatalogArtistBySlug,
} from '@/relisten/realm/models/artist_repo';
import { useRealm } from '@/relisten/realm/schema';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { type RelistenTabGroupSegment, useGroupSegment } from '@/relisten/util/routes';
import { log } from '@/relisten/util/logging';
import { type SearchArtistRef, searchArtistRef, searchTapTarget } from './search_routes';
import type { SearchCatalogRow } from './search_types';

const logger = log.extend('search');

/**
 * Opens a search result in the current tab's stack, so Back returns to the
 * query, scope and scroll position. The row's artist is loaded first: a show
 * opens through `pushShow`, which reads the artist's source settings, and
 * every catalog path is keyed by the artist.
 */
export function useOpenSearchResult() {
  const realm = useRealm();
  const router = useRouter();
  const tab = useGroupSegment();
  const { apiClient } = useRelistenApi();
  const { pushShow } = usePushShowRespectingUserSettings();

  const loadArtist = useCallback(
    async (ref: SearchArtistRef | null): Promise<Artist | null> => {
      if (!ref) {
        return null;
      }
      if ('slug' in ref) {
        return ensureCatalogArtistBySlug(realm, apiClient, ref.slug);
      }
      await ensureCatalogArtist(realm, apiClient, ref.uuid);
      return realm.objectForPrimaryKey(Artist, ref.uuid)!;
    },
    [apiClient, realm]
  );

  // Loading a slug-only artist can take a moment; a second tap meanwhile is ignored.
  const opening = useRef(false);

  return useCallback(
    (row: SearchCatalogRow) =>
      followSearchTap(row, opening, {
        loadArtist,
        push: (href) => router.push(href),
        pushShow: (artist, showUuid) => pushShow({ artist, showUuid }),
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
    loadArtist: (ref: SearchArtistRef | null) => Promise<Artist | null>;
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
    const artist = await loadArtist(searchArtistRef(row));
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
