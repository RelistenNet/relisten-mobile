import { NavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { PropsWithChildren } from 'react';
import { Text, View } from 'react-native';
import { RefreshContextProvider } from '../../components/refresh_context';
import { useArtistVenues } from '../../realm/models/venue_repo';
import { AllArtistsTabStackParams } from '../Artist';
import { HomeTabsParamList } from '../Home';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistVenuesList'>;

export const VenuesListScreen: React.FC<PropsWithChildren<{} & NavigationProps>> = ({ route }) => {
  const { artistUuid } = route.params;
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();

  const results = useArtistVenues(artistUuid);
  const { data } = results;

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <Text className="text-white">Venue List</Text>
      </RefreshContextProvider>
    </View>
  );
};
