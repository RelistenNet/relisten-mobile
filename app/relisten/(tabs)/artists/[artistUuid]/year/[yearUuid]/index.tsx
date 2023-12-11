import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ShowList } from '@/relisten/components/shows_list';
import { useArtistYearShows } from '@/relisten/realm/models/year_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid, yearUuid } = useLocalSearchParams();

  const results = useArtistYearShows(String(artistUuid), String(yearUuid));
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
          headerHeight={50}
          ScrollableComponent={ShowList}
          shows={shows!}
          artist={artist}
          year={year}
          filterPersistenceKey={['artists', artistUuid, 'years', yearUuid].join('/')}
        />
      </RefreshContextProvider>
    </View>
  );
}
