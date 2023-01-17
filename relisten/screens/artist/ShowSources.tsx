import React, { PropsWithChildren } from 'react';
import { Text, View } from 'react-native-ui-lib';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AllArtistsTabStackParams } from '../Artist';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistShowSources'>;

export const ShowSourcesScreen: React.FC<PropsWithChildren<{} & NavigationProps>> = ({ route }) => {
  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <Text>Artist: {route.params.artistId}.</Text>
      <Text>Show: {route.params.showId}</Text>
    </View>
  );
};
