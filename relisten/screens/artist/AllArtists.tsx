import React, { useCallback, useEffect, useMemo } from 'react';
import Artist from '../../db/models/artist';
import { LayoutAnimation, SectionList } from 'react-native';
import { DefaultLayoutAnimationConfig } from '../../layout_animation_config';
import { ListItem, Text, View } from 'react-native-ui-lib';
import { database, Favorited } from '../../db/database';
import { useFavoritedQuery } from '../../db/models/favorites';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useAllArtistsQuery } from '../../db/repos';
import { HomeTabsParamList } from '../Home';
import { FavoriteIconButton } from '../../components/favorite_icon_button';
import { SectionHeader } from '../../components/section_header';
import { SectionedListItem } from '../../components/sectioned_list_item';
import { RelistenText } from '../../components/relisten_text';
import { ItemSeparator } from '../../components/item_separator';
import { useObservableState } from 'observable-hooks';

const ArtistListItem: React.FC<{ artist: Artist }> = ({ artist }) => {
  const isFavorite = useObservableState(artist.isFavorite) || false;
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

const ArtistsList: React.FC<{ artists: Favorited<Artist>[] }> = ({ artists }) => {
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
        return <ArtistListItem artist={artist.model} />;
      }}
    />
  );
};

export const AllArtistsScreen: React.FC = () => {
  const { showLoadingIndicator, error, data: rawArtists$ } = useAllArtistsQuery();
  const artists$ = useFavoritedQuery(database, rawArtists$);
  const artists = useObservableState(artists$);
  const navigation = useNavigation();

  useEffect(() => {
    if (!artists) {
      navigation.setOptions({ title: 'Artists' });
    } else {
      navigation.setOptions({ title: `${artists.length} Artists` });
    }
  }, [artists]);

  if (showLoadingIndicator || !artists) {
    return <Text>Loading...</Text>;
  }

  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <ArtistsList artists={artists} />
    </View>
  );
};
