import React, { PropsWithChildren } from 'react';
import { Text, View } from 'react-native-ui-lib';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AllArtistsTabStackParams } from '../Artist';
import { useFullShowQuery } from '../../db/show_source_repo';
import { useObservableState } from 'observable-hooks';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistShowSources'>;

export const ShowSourcesScreen: React.FC<PropsWithChildren<{} & NavigationProps>> = ({ route }) => {
  const { showLoadingIndicator, error, data } = useFullShowQuery(route.params.showId)();
  const fullShow = useObservableState(data);

  if (showLoadingIndicator || !data || !fullShow) {
    return <Text>Loading...</Text>;
  }

  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <Text>Artist: {route.params.artistId}.</Text>
      <Text>Show: {route.params.showId}</Text>
      {fullShow.sources.map((source, idx) => (
        <View key={idx}>
          <Text>
            {'\t'}Source {idx + 1}
          </Text>
          <Text>
            {'\t'}Sets {source.sourceSets.length}
          </Text>
          {source.sourceSets.map((set, idx) => (
            <View key={idx}>
              <Text>
                {'\t\t'}Set {idx + 1}
              </Text>
              <Text>
                {'\t\t'}Tracks {set.sourceTracks.length}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};