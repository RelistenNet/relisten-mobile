import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import { SortDirection } from '@/relisten/components/filtering/filters';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { useArtistYears } from '@/relisten/realm/models/year_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect } from 'react';
import { YearsListContainer } from '@/relisten/pages/artist/years_list';
import { YearFilterKey } from '@/relisten/pages/artist/years_filters';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();

  const results = useArtistYears(String(artistUuid));
  const {
    data: { years, artist },
  } = results;

  useEffect(() => {
    navigation.setOptions({
      title: artist?.name,
      headerRight: () => artist && <FavoriteObjectButton object={artist} />,
    });
  }, [artist]);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={YearsListContainer}
        artist={artist}
        years={years}
        filterOptions={{
          persistence: { key: ['artists', artistUuid, 'years'].join('/') },
          default: {
            persistenceKey: YearFilterKey.Year,
            sortDirection: SortDirection.Ascending,
            active: true,
          },
        }}
      />
    </RefreshContextProvider>
  );
}
