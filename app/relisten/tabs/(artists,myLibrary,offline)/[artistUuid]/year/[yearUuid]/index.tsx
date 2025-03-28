import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowListContainer } from '@/relisten/components/shows_list';
import { Artist } from '@/relisten/realm/models/artist';
import { Year } from '@/relisten/realm/models/year';
import { useArtistYearShows, useYearMetadata } from '@/relisten/realm/models/year_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid, yearUuid } = useLocalSearchParams();

  const results = useArtistYearShows(artistUuid as string, yearUuid as string);
  const {
    data: {
      yearShows: { year, shows },
      artist,
    },
  } = results;

  useEffect(() => {
    navigation.setOptions({
      title: year?.year,
    });
  }, [year]);

  const data = useMemo(() => {
    return [{ data: [...shows] }];
  }, [shows]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <DisappearingHeaderScreen
          ScrollableComponent={ShowListContainer}
          isLoading={results.isNetworkLoading}
          ListHeaderComponent={<YearHeader artist={artist} year={year} />}
          data={data}
          filterOptions={{
            persistence: { key: ['artists', artistUuid, 'years', 'shows'].join('/') },
          }}
        />
      </RefreshContextProvider>
    </View>
  );
}

const YearHeader = ({ year }: { artist: Artist | null; year: Year | null }) => {
  const metadata = useYearMetadata(year);
  return (
    <View className="flex w-full flex-col items-center gap-1 py-2">
      <RelistenText className="w-full text-center text-4xl font-bold text-white" selectable={false}>
        {year?.year}
      </RelistenText>

      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="show" count={metadata.shows} /> &middot;&nbsp;
        <Plur word="tape" count={metadata.sources} />
      </RelistenText>
    </View>
  );
};
