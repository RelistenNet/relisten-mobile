import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenSectionList } from '@/relisten/components/relisten_section_list';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { memo } from '@/relisten/util/memo';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import Realm from 'realm';

const ArtistListItem = memo(({ artist }: { artist: Artist }) => {
  return (
    <SectionedListItem>
      <Link
        href={{
          pathname: '/artists/[uuid]',
          params: {
            uuid: artist.uuid,
          },
        }}
      >
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
      </Link>
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

export default function Page() {
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
}
