import React, { PropsWithChildren, useEffect } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { ShowList } from '../../components/shows_list';
import { Show } from '../../realm/models/show';
import { AllArtistsTabStackParams } from '../Artist';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { HomeTabsParamList } from '../Home';
import { useArtistYearShows } from '../../realm/models/year_repo';
import { RefreshContextProvider } from '../../components/refresh_context';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistYearShows'>;

export const YearShowsScreen: React.FC<PropsWithChildren<{} & NavigationProps>> = ({ route }) => {
  const { artistUuid, yearUuid } = route.params;
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();

  const results = useArtistYearShows(artistUuid, yearUuid);
  const {
    data: {
      yearShows: { year, shows },
    },
  } = results;

  useEffect(() => {
    if (year) {
      navigation.setOptions({ title: year.year });
    } else {
      navigation.setOptions({ title: 'Shows' });
    }
  }, [year]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <ShowList
          shows={shows}
          onItemPress={(show: Show) =>
            navigation.navigate('AllArtistsTab', {
              screen: 'ArtistShowSources',
              params: {
                artistUuid: artistUuid,
                showUuid: show.uuid,
              },
            })
          }
        />
      </RefreshContextProvider>
    </View>
  );
};
