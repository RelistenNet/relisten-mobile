import React, { useCallback, useMemo } from 'react';
import Artist from '../../db/models/artist';
import { LayoutAnimation, SectionList, StyleSheet } from 'react-native';
import { DefaultLayoutAnimationConfig } from '../../layout_animation_config';
import { ListItem, Text, TouchableOpacity, View } from 'react-native-ui-lib';
import withObservables from '@nozbe/with-observables';
import { database, Favorited } from '../../db/database';
import { Observable } from 'rxjs';
import { asFavorited } from '../../db/models/favorites';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useAllArtistsQuery } from '../../db/repos';
import { HomeTabsParamList } from '../Home';

const ArtistListItem: React.FC<{ artist: Artist; isFavorite: boolean }> = ({
  artist,
  isFavorite,
}) => {
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();

  const styles = useArtistListItemStyles();
  const listItemOnPress = useCallback(() => {
    navigation.navigate('AllArtistsTab', {
      screen: 'ArtistYears',
      params: {
        artistId: artist.id,
      },
    });
  }, [artist]);
  const favoriteOnPress = useCallback(() => {
    LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
    artist.setIsFavorite(!isFavorite);
  }, [artist, isFavorite]);

  return (
    <ListItem style={styles.listItem} onPress={listItemOnPress}>
      <ListItem.Part middle>
        <Text>{artist.name}</Text>
      </ListItem.Part>
      <ListItem.Part right>
        <TouchableOpacity onPress={favoriteOnPress}>
          <Text>favorite: {isFavorite ? 'yes' : 'no'}</Text>
        </TouchableOpacity>
      </ListItem.Part>
    </ListItem>
  );
};

const enhanceArtist = withObservables(['artist'], ({ artist }) => ({
  artist,
  isFavorite: artist.isFavorite,
}));

export const EnhancedArtistListItem = enhanceArtist(ArtistListItem);

const useArtistListItemStyles = () =>
  StyleSheet.create({
    listItem: {
      paddingHorizontal: 8,
      width: '100%',
    },
  });

const ArtistsList: React.FC<{ artists: Favorited<Artist>[] }> = ({ artists }) => {
  const sectionedArtists = useMemo(() => {
    return [
      { title: 'Favorites', data: artists.filter((a) => a.isFavorite) },
      { title: 'Featured', data: artists.filter((a) => a.model.featured !== 0) },
      { title: `${artists.length + 1} Artists`, data: artists },
    ];
  }, [artists]);

  return (
    <SectionList
      sections={sectionedArtists}
      keyExtractor={(artist) => artist.model.id}
      renderSectionHeader={({ section: { title } }) => {
        return <Text>{title}</Text>;
      }}
      renderItem={({ item: artist }) => {
        return <EnhancedArtistListItem artist={artist.model} />;
      }}
    />
  );
};

const enhanceArtists = withObservables(
  ['artists'],
  ({ artists }: { artists: Observable<Artist[] | undefined> }) => ({
    artists: asFavorited(database, artists),
  })
);

export const EnhancedArtistsList = enhanceArtists(ArtistsList);

export const AllArtistsScreen: React.FC = () => {
  const { showLoadingIndicator, error, data: artists } = useAllArtistsQuery();

  if (showLoadingIndicator || !artists) {
    return <Text>Loading...</Text>;
  }

  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <EnhancedArtistsList artists={artists} />
    </View>
  );
};
