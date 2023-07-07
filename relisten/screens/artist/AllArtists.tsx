import Realm from 'realm';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { FavoriteObjectButton } from '../../components/favorite_icon_button';
import Flex from '../../components/flex';
import RowSubtitle from '../../components/row_subtitle';
import RowTitle from '../../components/row_title';
import { SectionedListItem } from '../../components/sectioned_list_item';
import { Artist } from '../../realm/models/artist';
import { HomeTabsParamList } from '../Home';
import { useArtists } from '../../realm/models/artist_repo';
import { RelistenSectionList } from '../../components/relisten_section_list';
import { memo } from '../../util/memo';
import { RefreshContextProvider } from '../../components/refresh_context';

const ArtistListItem = memo(({ artist }: { artist: Artist }) => {
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();

  const listItemOnPress = useCallback(() => {
    navigation.navigate('AllArtistsTab', {
      screen: 'ArtistYears',
      params: {
        artistUuid: artist.uuid,
      },
    });
  }, [artist]);

  return (
    <SectionedListItem onPress={listItemOnPress}>
      <Flex className="justify-between" full>
        <View className="flex flex-1 flex-col">
          <RowTitle>{artist.name}</RowTitle>
          <Flex className="justify-between">
            <RowSubtitle>{artist.showCount.toLocaleString()} shows</RowSubtitle>
            <RowSubtitle>{artist.sourceCount.toLocaleString()} tapes</RowSubtitle>
          </Flex>
        </View>
        <FavoriteObjectButton object={artist} />
      </Flex>
    </SectionedListItem>
  );
});

const ArtistsList = ({ artists }: { artists: Realm.Results<Artist> }) => {
  const sectionedArtists = useMemo(() => {
    const all = [...artists];
    const r = [
      { title: 'Favorites', data: all.filter((a) => a.isFavorite) },
      { title: 'Featured', data: all.filter((a) => a.featured !== 0) },
      { title: `${all.length} Artists`, data: all },
    ];

    return r;
  }, [artists]);

  return (
    <RelistenSectionList
      sections={sectionedArtists}
      renderItem={({ item: artist }) => {
        return <ArtistListItem artist={artist} />;
      }}
    ></RelistenSectionList>
  );
};

export const AllArtistsScreen: React.FC = () => {
  const results = useArtists();
  const { data: artists } = results;
  const navigation = useNavigation();

  useEffect(() => {
    if (!artists) {
      navigation.setOptions({ title: 'Artists' });
    } else {
      navigation.setOptions({ title: `${artists.length} Artists` });
    }
  }, [artists]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <ArtistsList artists={artists} />
      </RefreshContextProvider>
    </View>
  );
};
