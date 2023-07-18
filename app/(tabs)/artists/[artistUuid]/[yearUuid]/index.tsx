import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { ShowList } from '@/relisten/components/shows_list';
import { useArtistYearShows } from '@/relisten/realm/models/year_repo';
import { useGlobalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid, yearUuid } = useGlobalSearchParams();

  const results = useArtistYearShows(String(artistUuid), String(yearUuid));
  const {
    data: {
      yearShows: { year, shows },
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
        <ShowList shows={shows} />
      </RefreshContextProvider>
    </View>
  );
}
