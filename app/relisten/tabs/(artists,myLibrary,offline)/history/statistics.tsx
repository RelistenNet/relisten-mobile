import {
  ArtistListeningTime,
  useListeningTimeByArtist,
  useTotalListeningTime,
} from '@/relisten/realm/models/history/playback_history_entry_repo';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { useNavigation } from '@react-navigation/native';
import { type ParamListBase } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { View } from 'react-native';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import {
  Filter,
  FilteringOptions,
  FilteringProvider,
  searchForSubstring,
  SortDirection,
} from '@/relisten/components/filtering/filters';

function formatListeningTime(totalSeconds: number): string {
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (totalSeconds >= 86400) {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    return `${days}d ${hours}h ${minutes}m`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function FormattedListeningTimeHeader({ totalSeconds }: { totalSeconds: number }) {
  if (totalSeconds >= 86400) {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return (
      <RelistenText className="text-center text-5xl font-bold text-white">
        {days}
        <RelistenText className="text-gray-400 text-3xl">d</RelistenText> {hours}
        <RelistenText className="text-gray-400 text-3xl">h</RelistenText> {minutes}
        <RelistenText className="text-gray-400 text-3xl">m</RelistenText>
      </RelistenText>
    );
  }
  return (
    <RelistenText className="text-center text-5xl font-bold text-white">
      {formatListeningTime(totalSeconds)}
    </RelistenText>
  );
}

function StatisticsHeader({ totalSeconds }: { totalSeconds: number }) {
  return (
    <View className="flex w-full flex-col items-center gap-1 py-2 pb-8">
      <RelistenText
        className="w-full text-center text-4xl font-bold text-white pb-4"
        selectable={false}
      >
        My Statistics
      </RelistenText>
      <View>
        <RelistenText className="text-xl text-center italic text-gray-400">
          Total Listening Time
        </RelistenText>
        <FormattedListeningTimeHeader totalSeconds={totalSeconds} />
      </View>
    </View>
  );
}

const ArtistListItem = ({ artist }: { artist: ArtistListeningTime }) => {
  return (
    <View>
      <View className="flex-row items-center justify-between px-4 py-3 pb-1">
        <RelistenText
          className="flex-1 text-base text-lg font-semibold text-white"
          numberOfLines={1}
        >
          {artist.artistName}
        </RelistenText>
        <RelistenText className="text-lg text-white">
          {formatListeningTime(artist.totalSeconds)}
        </RelistenText>
      </View>
      {artist.years.map((yearEntry) => (
        <View key={yearEntry.year} className="flex-row items-center justify-between py-2 pl-8 pr-4">
          <RelistenText className="text-md text-gray-400">{yearEntry.year}</RelistenText>
          <RelistenText className="text-md text-gray-400">
            {formatListeningTime(yearEntry.totalSeconds)}
          </RelistenText>
        </View>
      ))}
    </View>
  );
};

export enum ArtistStatsFilterKey {
  Name = 'name',
  ListeningTime = 'listeningTime',
  Search = 'search',
}

const ARTIST_STATS_FILTERS: Filter<ArtistStatsFilterKey, ArtistListeningTime>[] = [
  {
    persistenceKey: ArtistStatsFilterKey.Name,
    title: 'Name',
    sortDirection: SortDirection.Ascending,
    active: false,
    isNumeric: false,
    sort: (items) => items.sort((a, b) => a.artistName.localeCompare(b.artistName)),
  },
  {
    persistenceKey: ArtistStatsFilterKey.ListeningTime,
    title: 'Listen Time',
    sortDirection: SortDirection.Descending,
    active: true,
    isNumeric: true,
    sort: (items) => items.sort((a, b) => a.totalSeconds - b.totalSeconds),
  },
  {
    persistenceKey: ArtistStatsFilterKey.Search,
    title: 'Search',
    active: false,
    searchFilter: (item, searchText) =>
      searchForSubstring(item.artistName, searchText.toLowerCase()),
  },
];

interface ArtistBreakdownListProps {
  artists: ArtistListeningTime[];
  totalSeconds: number;
  filterOptions: FilteringOptions<ArtistStatsFilterKey>;
}

const ArtistBreakdownList = ({
  artists,
  totalSeconds,
  filterOptions,
  onScroll,
  scrollEventThrottle,
}: ArtistBreakdownListProps &
  Omit<FilterableListProps<ArtistListeningTime>, 'data' | 'renderItem'>) => {
  return (
    <FilteringProvider filters={ARTIST_STATS_FILTERS} options={filterOptions}>
      <FilterableList
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle}
        ListHeaderComponent={<StatisticsHeader totalSeconds={totalSeconds} />}
        data={[{ data: artists }]}
        renderItem={({ item }) => <ArtistListItem artist={item} />}
      />
    </FilteringProvider>
  );
};

export default function StatisticsPage() {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const totalListeningTimeSeconds = useTotalListeningTime();
  const artistBreakdown = useListeningTimeByArtist();
  const artists = artistBreakdown.map((item) => ({ ...item, uuid: item.uuid }));

  useEffect(() => {
    navigation.setOptions({ title: 'My Statistics' });
  }, [navigation]);

  return (
    <DisappearingHeaderScreen
      ScrollableComponent={ArtistBreakdownList}
      artists={artists}
      totalSeconds={totalListeningTimeSeconds}
      filterOptions={{ persistence: { key: 'statistics/by-artist' } }}
    />
  );
}
