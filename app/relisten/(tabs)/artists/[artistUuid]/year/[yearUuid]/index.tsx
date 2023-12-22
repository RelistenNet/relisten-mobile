import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowListContainer } from '@/relisten/components/shows_list';
import { useArtistYearShows } from '@/relisten/realm/models/year_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Artist } from '@/relisten/realm/models/artist';
import { Year } from '@/relisten/realm/models/year';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';

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

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <DisappearingHeaderScreen
          ScrollableComponent={ShowListContainer}
          ListHeaderComponent={<YearHeader artist={artist} year={year} />}
          shows={shows}
          artist={artist}
          filterOptions={{
            persistence: { key: ['artists', artistUuid, 'years', yearUuid].join('/') },
          }}
        />
      </RefreshContextProvider>
    </View>
  );
}

const YearHeader = ({ year }: { artist: Artist | null; year: Year | null }) => {
  const totalShows = year?.showCount;
  const totalTapes = year?.sourceCount;

  return (
    <View className="flex w-full flex-col items-center gap-1 py-2">
      <RelistenText className="w-full text-center text-4xl font-bold text-white" selectable={false}>
        {year?.year}
      </RelistenText>

      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="show" count={totalShows} /> &middot;&nbsp;
        <Plur word="tape" count={totalTapes} />
      </RelistenText>
    </View>
  );
};
