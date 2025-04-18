import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowFilterKey, ShowListContainer } from '@/relisten/components/shows_list';
import { TourShows, useArtistTourShows } from '@/relisten/realm/models/shows/tour_shows_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import Plur from '@/relisten/components/plur';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { SortDirection } from '@/relisten/components/filtering/filters';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid, tourUuid } = useLocalSearchParams();
  const results = useArtistTourShows(String(artistUuid), String(tourUuid));
  const { tour } = results.data;
  const { shows } = tour;

  useEffect(() => {
    navigation.setOptions({
      title: results.data.tour.tour?.name,
    });
  }, []);

  const data = useMemo(() => {
    return [{ data: [...shows] }];
  }, [shows]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <DisappearingHeaderScreen
          ScrollableComponent={ShowListContainer}
          ListHeaderComponent={<TourHeader tour={tour} />}
          data={data}
          filterOptions={{
            persistence: { key: ['artists', artistUuid, 'tour', tourUuid].join('/') },
            default: {
              persistenceKey: ShowFilterKey.Date,
              sortDirection: SortDirection.Ascending,
              active: true,
            },
          }}
        />
      </RefreshContextProvider>
    </View>
  );
}

const TourHeader = ({ tour }: { tour: TourShows | null }) => {
  const totalShows = tour?.shows.length;
  return (
    <View className="flex w-full flex-col items-center gap-1 py-2">
      <RelistenText className="w-full text-center text-4xl font-bold text-white" selectable={false}>
        {tour?.tour?.name}
      </RelistenText>

      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="show" count={totalShows} />
      </RelistenText>
    </View>
  );
};
