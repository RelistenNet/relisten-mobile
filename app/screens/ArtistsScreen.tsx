import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {ArtistWithCounts} from '../api';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {useObservableState} from 'observable-hooks';
import {RelistenDb} from '../db/database';

const ArtistsScreen = () => {
  const artistsRes = useObservableState(RelistenDb.instance.artists(), {
    isLoading: true,
  });

  if (artistsRes.isLoading) {
    return <Text>Loading...</Text>;
  }

  return (
    <SafeAreaProvider>
      <FlatList
        data={artistsRes.data}
        renderItem={({item: artist, _index}) => (
          <ArtistListItem artist={artist} />
        )}
      />
    </SafeAreaProvider>
  );
};

const ArtistListItem = ({artist}: {artist: ArtistWithCounts}) => {
  return (
    <View style={artistListItemStyles.container}>
      <View style={artistListItemStyles.text}>
        <Text style={artistListItemStyles.title}>{artist.name}</Text>
        <Text style={artistListItemStyles.subtitle}>
          {artist.showCount} shows • {artist.sourceCount} sources
        </Text>
      </View>
      <Text>Button</Text>
    </View>
  );
};

const artistListItemStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    flexDirection: 'column',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '400',
  },
  button: {
    fontWeight: '700',
  },
});

export default ArtistsScreen;
