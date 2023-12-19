import { SortDirection } from '@/relisten/components/filtering/filters';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { useArtistTopShows } from '@/relisten/realm/models/shows/top_shows_repo';
import { ShowFilterKey, ShowList } from '@/relisten/components/shows_list';

const topRatedFilterOptions = {
  default: {
    persistenceKey: ShowFilterKey.Rating,
    active: true,
    sortDirection: SortDirection.Descending,
  },
};

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistTopShows(artistUuid as string);

  useEffect(() => {
    navigation.setOptions({
      title: 'Top Shows',
    });
  }, []);

  // The API will only return the 25 top shows so stop it here otherwise it'll just show the 26th top show of
  // whatever is cached
  const shows = useMemo(() => {
    return results.data.shows.slice(0, 25);
  }, [results.data.shows]);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={ShowList}
        ListHeaderComponent={<ShowHeader />}
        shows={shows}
        artist={results.data.artist}
        filterOptions={topRatedFilterOptions}
        hideFilterBar={false}
      />
    </RefreshContextProvider>
  );
}

const ShowHeader = () => {
  return (
    <>
      <RelistenText
        className="w-full py-2 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        Top Shows
      </RelistenText>
    </>
  );
};
