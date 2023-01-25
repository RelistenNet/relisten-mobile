import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
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

const ArtistListItem: React.FC<{ artist: any }> = ({ artist }) => {
  const isFavorite = (false && useObservableState(artist.isFavorite)) || false;
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();

  const listItemOnPress = useCallback(() => {
    navigation.navigate('AllArtistsTab', {
      screen: 'ArtistYears',
      params: {
        artistId: artist.uuid,
      },
    });
  }, [artist]);
  const favoriteOnPress = useCallback(() => {
    LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
    artist.setIsFavorite(!isFavorite);
  }, [artist, isFavorite]);

  return (
    <SectionedListItem onPress={listItemOnPress}>
      <Flex className="justify-between" full>
        <View className="flex flex-1 flex-col">
          <RowTitle>{artist.name}</RowTitle>
          <Flex className="justify-between">
            <RowSubtitle>{artist.show_count.toLocaleString()} shows</RowSubtitle>
            <RowSubtitle>{artist.source_count.toLocaleString()} tapes</RowSubtitle>
          </Flex>
        </View>
        <FavoriteIconButton isFavorited={isFavorite} onPress={favoriteOnPress} />
      </Flex>
    </SectionedListItem>
  );
};

const ArtistsList = ({ artists }: any) => {
  const sectionedArtists = useMemo(() => {
    const favorites = artists.filter((a) => a.isFavorite && !a.model.featured);
    return [
      { title: 'Favorites', data: favorites },
      { title: 'Featured', data: artists.filter((a) => a.featured !== 0) },
      { title: `${artists.length} Artists`, data: artists },
    ];
  }, [artists]);

  return (
    <SectionList
      sections={sectionedArtists}
      keyExtractor={(artist) => artist.uuid}
      renderSectionHeader={({ section: { title } }) => {
        return <SectionHeader title={title} />;
      }}
      ItemSeparatorComponent={ItemSeparator}
      renderItem={({ item: artist }) => {
        return <ArtistListItem artist={artist} />;
      }}
    />
  );
};

export const AllArtistsScreen: React.FC = () => {
  const { isLoading, error, data, isFetching } = useQuery<any[]>(['/artists']);
  // const { showLoadingIndicator, error, data: rawArtists$ } = useAllArtistsQuery();
  // const artists$ = useFavoritedQuery(database, rawArtists$);
  // const artists = useObservableState(artists$);
  const navigation = useNavigation();

  useEffect(() => {
    if (!data) {
      navigation.setOptions({ title: 'Artists' });
    } else {
      navigation.setOptions({ title: `${data.length} Artists` });
    }
  }, [data]);

  if (isLoading || !data) {
    return <Text>Loading...</Text>;
  }

  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <ArtistsList artists={data} />
    </View>
  );
};
