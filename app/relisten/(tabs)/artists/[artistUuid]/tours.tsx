import { useArtistTours } from '@/relisten/realm/models/tour_repo';
import Flex from '@/relisten/components/flex';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { useLocalSearchParams } from 'expo-router';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import { FilteringProvider, Filter, SortDirection } from '@/relisten/components/filtering/filters';
import { useHeaderHeight } from '@react-navigation/elements';
import { Tour } from '@/relisten/realm/models/tour';
import dayjs from 'dayjs';

export default function Page() {
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistTours(String(artistUuid));
  const { data } = results;
  const headerHeight = useHeaderHeight();

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        headerHeight={headerHeight}
        ScrollableComponent={TourList}
        tours={Array.from(data.tours)}
        filterPersistenceKey={['artists', artistUuid, 'tours'].join('/')}
      />
    </RefreshContextProvider>
  );
}

interface TourListItemProps {
  tour: Tour;
}

const TourListItem = ({ tour }: TourListItemProps) => {
  const startDate = dayjs(tour.startDate).format('MM/DD/YYYY');
  const endDate = dayjs(tour.endDate).format('MM/DD/YYYY');

  return (
    <SectionedListItem>
      <Flex column>
        <RowTitle>{tour.name}</RowTitle>
        <SubtitleRow>
          <SubtitleText>
            {startDate} - {endDate}
          </SubtitleText>
        </SubtitleRow>
      </Flex>
    </SectionedListItem>
  );
};

interface TourHeaderProps {
  tours: Tour[];
}

const TourHeader = ({ tours }: TourHeaderProps) => {
  return (
    <>
      <RelistenText
        className="w-full py-2 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        Tours
      </RelistenText>
      <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
        <Plur word="Tour" count={tours.length} />
      </RelistenText>
    </>
  );
};

const VENUE_FILTERS: Filter<Tour>[] = [
  {
    persistenceKey: 'name',
    title: 'Name',
    sortDirection: SortDirection.Descending,
    active: true,
    isNumeric: false,
    sort: (venues) => venues.sort((a, b) => a.name.localeCompare(b.name)),
  },
];

interface TourListProps {
  tours: Tour[];
  filterPersistenceKey: string;
}

const TourList = ({
  tours,
  filterPersistenceKey,
}: TourListProps & Omit<FilterableListProps<Tour>, 'data' | 'renderItem'>) => {
  return (
    <FilteringProvider filters={VENUE_FILTERS} filterPersistenceKey={filterPersistenceKey}>
      <FilterableList
        ListHeaderComponent={<TourHeader tours={tours} />}
        className="w-full flex-1"
        data={tours}
        renderItem={({ item }: { item: Tour; index: number }) => <TourListItem tour={item} />}
      />
    </FilteringProvider>
  );
};
