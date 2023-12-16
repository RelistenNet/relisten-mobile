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
import { useArtistTopShows } from '@/relisten/realm/models/show_repo';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistTopShows(String(artistUuid));
  const { data } = results;
  const headerHeight = useHeaderHeight();

  useEffect(() => {
    navigation.setOptions({
      title: 'Top Shows',
    });
  }, []);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        headerHeight={headerHeight}
        ScrollableComponent={ShowList}
        shows={Array.from(data.shows)}
        filterPersistenceKey={['artists', artistUuid, 'shows'].join('/')}
      />
    </RefreshContextProvider>
  );
}

interface ShowListItemProps {
  show: Show;
}

const ShowListItem = ({ show }: ShowListItemProps) => {
  return (
    <SectionedListItem>
      <Flex column>
        <RowTitle>{show.displayDate}</RowTitle>
        <SubtitleRow>
          <SubtitleText>{show.venue?.name}</SubtitleText>
        </SubtitleRow>
      </Flex>
    </SectionedListItem>
  );
};

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

const SONG_FILTERS: Filter<Show>[] = [
  { persistenceKey: 'library', title: 'My Library', active: false, filter: (y) => y.isFavorite },
  {
    persistenceKey: 'date',
    title: 'Date',
    sortDirection: SortDirection.Descending,
    active: true,
    isNumeric: true,
    sort: (shows) => shows.sort((a, b) => a.date.valueOf() - b.date.valueOf()),
  },
  {
    persistenceKey: 'rating',
    title: 'Avg. Rating',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (shows) => shows.sort((a, b) => a.avgRating - b.avgRating),
  },
];

interface ShowListProps {
  shows: Show[];
  filterPersistenceKey: string;
}

const ShowList = ({
  shows,
  filterPersistenceKey,
}: ShowListProps & Omit<FilterableListProps<Show>, 'data' | 'renderItem'>) => {
  return (
    <FilteringProvider filters={SONG_FILTERS} filterPersistenceKey={filterPersistenceKey}>
      <FilterableList
        ListHeaderComponent={<ShowHeader />}
        data={shows}
        renderItem={({ item }: { item: Show; index: number }) => <ShowListItem show={item} />}
      />
    </FilteringProvider>
  );
};
