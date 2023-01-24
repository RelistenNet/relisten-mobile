import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useObservableState } from 'observable-hooks';
import React, { useCallback, useEffect, useMemo } from 'react';
import { LayoutAnimation, SectionList } from 'react-native';
import { Text, View } from 'react-native-ui-lib';
import { FavoriteIconButton } from '../../components/favorite_icon_button';
import Flex from '../../components/flex';
import { ItemSeparator } from '../../components/item_separator';
import RowSubtitle from '../../components/row_subtitle';
import RowTitle from '../../components/row_title';
import { SectionedListItem } from '../../components/sectioned_list_item';
import { SectionHeader } from '../../components/section_header';
import { database, Favorited } from '../../db/database';
import Artist from '../../db/models/artist';
import { useFavoritedQuery } from '../../db/models/favorites';
import { useAllArtistsQuery } from '../../db/repos';
import { DefaultLayoutAnimationConfig } from '../../layout_animation_config';
import { HomeTabsParamList } from '../Home';

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
      <Flex className="justify-between w-full">
        <View className="flex flex-col flex-1">
          <RowTitle>{artist.name}</RowTitle>
          <Flex className="justify-between">
            <RowSubtitle>{artist.showCount.toLocaleString()} shows</RowSubtitle>
            <RowSubtitle>{artist.sourceCount.toLocaleString()} tapes</RowSubtitle>
          </Flex>
        </View>
        <FavoriteIconButton isFavorited={isFavorite} onPress={favoriteOnPress} />
      </Flex>
    </SectionedListItem>
  );
};

const ArtistsList: React.FC<{ artists: Favorited<Artist>[] }> = ({ artists }) => {
  const sectionedArtists = useMemo(() => {
    const favorites = artists.filter((a) => a.isFavorite && !a.model.featured);
    return [
      { title: 'Favorites', data: favorites },
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
