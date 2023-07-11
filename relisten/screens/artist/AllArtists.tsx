import { NavigationProp, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Realm from 'realm';
import { FavoriteObjectButton } from '../../components/favorite_icon_button';
import Flex from '../../components/flex';
import { RefreshContextProvider } from '../../components/refresh_context';
import { RelistenSectionList } from '../../components/relisten_section_list';
import { SubtitleRow, SubtitleText } from '../../components/row_subtitle';
import RowTitle from '../../components/row_title';
import { SectionedListItem } from '../../components/sectioned_list_item';
import { Artist } from '../../realm/models/artist';
import { useArtists } from '../../realm/models/artist_repo';
import { memo } from '../../util/memo';
import { HomeTabsParamList } from '../Home';
import Plur from '../../components/plur';

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
      <Flex cn="justify-between" full>
        <Flex className="flex-1 flex-col pr-3">
          <RowTitle>{artist.name}</RowTitle>
          <SubtitleRow cn="flex flex-row justify-between">
            <SubtitleText>
              <Plur word="show" count={artist.showCount} />
            </SubtitleText>
            <SubtitleText>
              <Plur word="tape" count={artist.sourceCount} />
            </SubtitleText>
          </SubtitleRow>
        </Flex>
        <FavoriteObjectButton object={artist} />
      </Flex>
    </SectionedListItem>
  );
});

const ArtistsList = ({ artists }: { artists: Realm.Results<Artist> }) => {
  const sectionedArtists = useMemo(() => {
    const all = [...artists];
    const r = [
      { title: 'Featured', data: all.filter((a) => a.featured !== 0) },
      { title: `${all.length} Artists`, data: all },
    ];

    const favorites = all.filter((a) => a.isFavorite);
    if (favorites.length > 0) {
      r.unshift({ title: 'Favorites', data: favorites });
    }

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
  // const navigation = useNavigation();

  // useEffect(() => {
  //   if (!artists) {
  //     navigation.setOptions({ title: 'Artists' });
  //   } else {
  //     navigation.setOptions({ title: `${artists.length} Artists` });
  //   }
  // }, [artists]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <ArtistsList artists={artists} />
      </RefreshContextProvider>
    </View>
  );
};
