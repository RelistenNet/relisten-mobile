import { useArtistTours } from '@/relisten/realm/models/tour_repo';
import Flex from '@/relisten/components/flex';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import {
  Filter,
  FilteringOptions,
  FilteringProvider,
  SortDirection,
} from '@/relisten/components/filtering/filters';
import { Tour } from '@/relisten/realm/models/tour';
import dayjs from 'dayjs';
import { useEffect } from 'react';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistTours(String(artistUuid));
  const { data } = results;

  useEffect(() => {
    navigation.setOptions({
      title: 'Tours',
    });
  }, []);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={TourList}
        tours={Array.from(data.tours)}
        filterOptions={{ persistence: { key: ['artists', artistUuid, 'tours'].join('/') } }}
      />
    </RefreshContextProvider>
  );
}

interface TourListItemProps {
  tour: Tour;
}

const TourListItem = ({ tour }: TourListItemProps) => {
  const startDate = dayjs(tour.startDate).format('YYYY-MM-DD');
  const endDate = dayjs(tour.endDate).format('YYYY-MM-DD');

  return (
    <Link
      href={{
        pathname: '/relisten/(tabs)/artists/[artistUuid]/tour/[tourUuid]/' as const,
        params: {
          artistUuid: tour.artistUuid,
          tourUuid: tour.uuid,
        },
      }}
      asChild
    >
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
    </Link>
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

export enum TourFilterKey {
  Library = 'library',
  Name = 'name',
}

const TOUR_FILTERS: Filter<TourFilterKey, Tour>[] = [
  {
    persistenceKey: TourFilterKey.Library,
    title: 'My Library',
    active: false,
    filter: (y) => y.isFavorite,
  },
  {
    persistenceKey: TourFilterKey.Name,
    title: 'Name',
    sortDirection: SortDirection.Descending,
    active: true,
    isNumeric: false,
    sort: (tours) => tours.sort((a, b) => a.name.localeCompare(b.name)),
  },
];

interface TourListProps {
  tours: Tour[];
  filterOptions: FilteringOptions<TourFilterKey>;
}

const TourList = ({
  tours,
  filterOptions,
}: TourListProps & Omit<FilterableListProps<Tour>, 'data' | 'renderItem'>) => {
  return (
    <FilteringProvider filters={TOUR_FILTERS} options={filterOptions}>
      <FilterableList
        ListHeaderComponent={<TourHeader tours={tours} />}
        className="w-full flex-1"
        data={[{ data: tours }]}
        renderItem={({ item }) => {
          return <TourListItem tour={item} />;
        }}
      />
    </FilteringProvider>
  );
};
