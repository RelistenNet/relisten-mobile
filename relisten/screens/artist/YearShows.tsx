import React, { PropsWithChildren } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, View } from 'react-native-ui-lib';
import { useArtistYearShowsQuery } from '../../db/repos';
import { EnhancedShowsList } from '../../components/shows_list';
import Show from '../../db/models/show';
import { AllArtistsTabStackParams } from '../Artist';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistYearShows'>;

export const YearShowsScreen: React.FC<PropsWithChildren<{} & NavigationProps>> = ({
  route,
  navigation,
}) => {
  const { artistId, yearId } = route.params;

  // TODO: load artist object to set title

  const { showLoadingIndicator, error, data: shows } = useArtistYearShowsQuery(artistId, yearId)();

  if (showLoadingIndicator || !shows) {
    return <Text>Loading...</Text>;
  }

  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <EnhancedShowsList
        shows={shows}
        onItemPress={(show: Show) => console.log('Tapped', show.id)}
      />
    </View>
  );
};
