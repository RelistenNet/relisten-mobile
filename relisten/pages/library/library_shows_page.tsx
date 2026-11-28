import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenSectionData } from '@/relisten/components/relisten_section_list';
import { ShowFilterKey, ShowListContainer, useShowFilters } from '@/relisten/components/shows_list';
import { Show } from '@/relisten/realm/models/show';
import { useLibraryShowCatalogUuids } from '@/relisten/realm/root_services';
import { useQuery } from '@/relisten/realm/schema';
import { aggregateBy } from '@/relisten/util/group_by';
import { logTabRootDebug } from '@/relisten/util/profile_logging';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer } from 'react';

/** Every show in My Library, grouped by artist, with the show list's sorts and filters. */
export default function LibraryShowsPage() {
  const showFilters = useShowFilters();
  const allShows = useQuery(Show);
  const libraryShowUuids = useLibraryShowCatalogUuids();
  const [focusRevision, refreshAfterFocus] = useReducer((revision: number) => revision + 1, 0);

  useFocusEffect(
    useCallback(() => {
      // Tab roots are frozen while another tab or a pushed detail screen is
      // active. Re-read the external index on focus because React can suppress
      // the render that accompanied a Realm notification while this tree froze.
      refreshAfterFocus();
    }, [])
  );

  // Realm Results have a stable identity, so include the library set snapshot
  // and focus revision explicitly. React Compiler can then see both reasons
  // this derived array must be rebuilt.
  const favoriteShows = useMemo(
    () => [...allShows].filter((show) => libraryShowUuids.has(show.uuid)),
    [allShows, focusRevision, libraryShowUuids]
  );

  const favoriteShowsByArtist = useMemo<RelistenSectionData<Show>>(() => {
    const showsByArtistUuid = aggregateBy(favoriteShows, (s) => s.artistUuid);

    return Object.keys(showsByArtistUuid)
      .sort((a, b) => {
        const artistA = showsByArtistUuid[a][0].artist;
        const artistB = showsByArtistUuid[b][0].artist;

        return artistA.name.localeCompare(artistB.name);
      })
      .map((artistUuid) => {
        const shows = showsByArtistUuid[artistUuid];
        return {
          sectionTitle: shows[0].artist.name,
          data: shows,
        };
      });
  }, [favoriteShows]);
  const listExtraData = useMemo(
    () => ({ focusRevision, libraryShowUuids }),
    [focusRevision, libraryShowUuids]
  );

  const nonIdealState = {
    noData: {
      title: 'No Shows in Library',
      description:
        'After you tap the heart icon to add shows to your library, they will show up here.',
    },
  };
  // TODO(alecgorge): if the user has a favorited source within that show, take them directly there

  useEffect(() => {
    logTabRootDebug('myLibrary.shows mount');

    return () => {
      logTabRootDebug('myLibrary.shows unmount');
    };
  }, []);

  return (
    <RefreshContextProvider>
      <ShowListContainer
        data={favoriteShowsByArtist}
        extraData={listExtraData}
        filterOptions={{
          persistence: { key: ['myLibrary', 'shows'].join('/') },
        }}
        // hide "My Library" filter since it's enabled by default here
        filters={showFilters.filter((sf) => sf.persistenceKey !== ShowFilterKey.Library)}
        nonIdealState={nonIdealState}
      />
    </RefreshContextProvider>
  );
}
