import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {RootState} from '../store';
import {useSelector} from 'react-redux';
import {useRequest} from 'redux-query-react';
import {apiV2ArtistsGet, ArtistWithCounts} from '../api';
import {SafeAreaProvider} from 'react-native-safe-area-context';

const getArtists = (state: RootState) => state.entities.artists;
const artistsQuery = apiV2ArtistsGet({
  update: {
    artists: (
      oldValue: ArtistWithCounts[] | undefined,
      newValue: ArtistWithCounts[],
    ) => newValue,
  },
  transform: body => {
    return {artists: body};
  },
});

const ArtistsScreen = () => {
  const artists: ArtistWithCounts[] = useSelector(getArtists) || [];

  const [{isPending, status}, refresh] = useRequest(artistsQuery);

  if (isPending) {
    return <Text>Loading...</Text>;
  }

  if (typeof status === 'number' && status != 200) {
    return <Text>Error??</Text>;
  }

  return (
    <SafeAreaProvider>
      <FlatList
        data={artists}
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
