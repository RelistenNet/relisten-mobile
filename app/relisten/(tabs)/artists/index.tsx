import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenSectionList } from '@/relisten/components/relisten_section_list';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { Link } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Realm from 'realm';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';

const ArtistListItem = React.forwardRef(({ artist }: { artist: Artist }, ref) => {
  return (
    <Link
      href={{
        pathname: '/relisten/(tabs)/artists/[artistUuid]/' as const,
        params: {
          artistUuid: artist.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem ref={ref}>
        <Flex cn="justify-between" full>
          <Flex cn="flex-1 flex-col pr-3">
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
    </Link>
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

export default function Page() {
  const results = useArtists();
  const { data: artists } = results;

  const bottomTabBarHeight = useBottomTabBarHeight();
  const { setTabBarHeight } = useRelistenPlayerBottomBarContext();

  useEffect(() => {
    setTabBarHeight(bottomTabBarHeight);
  }, [bottomTabBarHeight, setTabBarHeight]);

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
        <ScrollScreen>
          <Link
            href={{
              pathname: '/relisten/(tabs)/artists/[artistUuid]/show/[showUuid]/',
              params: {
                artistUuid: '77a58ff9-2e01-c59c-b8eb-cff106049b72',
                showUuid: '104c96e5-719f-366f-b72d-8d53709c80e0',
              },
            }}
            style={{ padding: 10 }}
          >
            <RelistenText>Barton hall test show</RelistenText>
          </Link>
          <ArtistsList artists={artists} />
        </ScrollScreen>
      </RefreshContextProvider>
    </View>
  );
}
