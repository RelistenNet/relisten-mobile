import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import { Filter, FilteringProvider, SortDirection } from '@/relisten/components/filtering/filters';
import Flex from '@/relisten/components/flex';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Show } from '@/relisten/realm/models/show';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect } from 'react';
import { useArtistTopShows } from '@/relisten/realm/models/shows/top_shows_repo';
import { ShowList } from '@/relisten/components/shows_list';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistTopShows(artistUuid as string);

  useEffect(() => {
    navigation.setOptions({
      title: 'Top Shows',
    });
  }, []);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={ShowList}
        shows={results.data.shows}
        artist={results.data.artist}
        filterPersistenceKey={['artists', results.data.artist?.uuid, 'top-shows'].join('/')}
        hideFilterBar={false}
      >
        <ShowHeader />
      </DisappearingHeaderScreen>
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
