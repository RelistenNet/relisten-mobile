import {
  FilterableListProps,
  FilterableList,
} from '@/relisten/components/filtering/filterable_list';
import { SortDirection, FilteringProvider, Filter } from '@/relisten/components/filtering/filters';
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Show } from '@/relisten/realm/models/show';
import { useArtistRecentShows } from '@/relisten/realm/models/show_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistRecentShows(String(artistUuid));
  const { data } = results;
  const headerHeight = useHeaderHeight();
  // console.log(JSON.stringify(shows));

  useEffect(() => {
    navigation.setOptions({
      title: 'Recent Shows',
    });
  }, []);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        headerHeight={headerHeight}
        ScrollableComponent={RecentList}
        shows={Array.from(data.shows)}
        filterPersistenceKey={['artists', artistUuid, 'shows'].join('/')}
      />
    </RefreshContextProvider>
  );
}

interface RecentListItemProps {
  recent: Show;
}

const RecentListItem = ({ recent }: RecentListItemProps) => {
  return (
    <SectionedListItem>
      <Flex column>
        <RowTitle>{recent.displayDate}</RowTitle>
        <SubtitleRow>
          <SubtitleText>{recent.venue?.name}</SubtitleText>
        </SubtitleRow>
      </Flex>
    </SectionedListItem>
  );
};

const RecentHeader = () => {
  return (
    <>
      <RelistenText
        className="w-full py-2 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        Recent Shows
      </RelistenText>
    </>
  );
};

const SONG_FILTERS: Filter<Show>[] = [
  { persistenceKey: 'library', title: 'My Library', active: false, filter: (y) => y.isFavorite },
  {
    persistenceKey: 'date',
    title: 'Date',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: true,
    sort: (recents) => recents.sort((a, b) => a.date.valueOf() - b.date.valueOf()),
  },
  {
    persistenceKey: 'rating',
    title: 'Avg. Rating',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (recents) => recents.sort((a, b) => a.avgRating - b.avgRating),
  },
];

interface RecentListProps {
  shows: Show[];
  filterPersistenceKey: string;
}

const RecentList = ({
  shows,
  filterPersistenceKey,
  ...props
}: RecentListProps & Omit<FilterableListProps<Show>, 'data' | 'renderItem'>) => {
  return (
    <FilteringProvider filters={SONG_FILTERS} filterPersistenceKey={filterPersistenceKey}>
      <FilterableList
        ListHeaderComponent={<RecentHeader />}
        data={shows}
        renderItem={({ item }: { item: Show; index: number }) => <RecentListItem recent={item} />}
        {...props}
      />
    </FilteringProvider>
  );
};