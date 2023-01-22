import React, { useCallback, useEffect, useMemo } from 'react';
import Artist from '../../db/models/artist';
import { LayoutAnimation, SectionList, StyleSheet } from 'react-native';
import { DefaultLayoutAnimationConfig } from '../../layout_animation_config';
import { ListItem, Text, View } from 'react-native-ui-lib';
import withObservables from '@nozbe/with-observables';
import { database, Favorited } from '../../db/database';
import { Observable } from 'rxjs';
import { asFavorited } from '../../db/models/favorites';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useAllArtistsQuery } from '../../db/repos';
import { HomeTabsParamList } from '../Home';
import { FavoriteIconButton } from '../../components/favorite_icon_button';
import { SectionHeader } from '../../components/section_header';
import { SectionedListItem } from '../../components/sectioned_list_item';
import { RelistenText } from '../../components/relisten_text';
import { ItemSeparator } from '../../components/item_separator';

const ArtistListItem: React.FC<{ artist: Artist; isFavorite: boolean }> = ({
  artist,
  isFavorite,
}) => {
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();

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
    <SectionedListItem onPress={listItemOnPress}>
      <ListItem.Part middle>
        <RelistenText>{artist.name}</RelistenText>
      </ListItem.Part>
      <ListItem.Part right>
        <FavoriteIconButton isFavorited={isFavorite} onPress={favoriteOnPress} />
      </ListItem.Part>
    </SectionedListItem>
  );
};

const enhanceArtist = withObservables(['artist'], ({ artist }) => ({
  artist,
  isFavorite: artist.isFavorite,
}));

export const EnhancedArtistListItem = enhanceArtist(ArtistListItem);

const ArtistsList: React.FC<{ artists: Favorited<Artist>[] }> = ({ artists }) => {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ title: `${artists.length} Artists` });
  }, [artists.length]);

  const sectionedArtists = useMemo(() => {
    return [
      { title: 'Favorites', data: artists.filter((a) => a.isFavorite) },
      { title: 'Featured', data: artists.filter((a) => a.model.featured !== 0) },
      { title: `${artists.length} Artists`, data: artists },
    ];
  }, [artists]);

  return (
    <SectionList
      sections={sectionedArtists}
      keyExtractor={(artist) => artist.model.id}
      renderSectionHeader={({ section: { title } }) => {
        return <SectionHeader title={title} />;
      }}
      ItemSeparatorComponent={ItemSeparator}
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
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ title: 'Artists' });
  }, []);

  if (showLoadingIndicator || !artists) {
    return <Text>Loading...</Text>;
  }

  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <EnhancedArtistsList artists={artists} />
    </View>
  );
};
