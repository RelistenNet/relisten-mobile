import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import {
  RelistenSectionHeader,
  RelistenSectionList,
} from '@/relisten/components/relisten_section_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistMetadata, useArtists } from '@/relisten/realm/models/artist_repo';
import { useIsDownloadsTab, useRoute } from '@/relisten/util/routes';
import { Link } from 'expo-router';
import plur from 'plur';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Realm from 'realm';

const ArtistListItem = React.forwardRef(({ artist }: { artist: Artist }, ref) => {
  const nextRoute = useRoute('[artistUuid]');
  const metadata = useArtistMetadata(artist);

  return (
    <Link
      href={{
        pathname: nextRoute,
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
                <Plur word="show" count={metadata.shows} />
              </SubtitleText>
              <SubtitleText>
                <Plur word="tape" count={metadata.sources} />
              </SubtitleText>
            </SubtitleRow>
          </Flex>
          <FavoriteObjectButton object={artist} />
        </Flex>
      </SectionedListItem>
    </Link>
  );
});

type ArtistsListProps = {
  artists: Realm.Results<Artist>;
};

const ArtistsList = ({ artists, ...props }: ArtistsListProps) => {
  const isDownloadsTab = useIsDownloadsTab();

  const sectionedArtists = useMemo(() => {
    const all = [...artists].sort((a, b) => {
      return a.sortName.localeCompare(b.sortName);
    });

    const r = [];
    if (!isDownloadsTab) {
      r.push(
        { sectionTitle: 'Featured' },
        ...all.filter((a) => a.featured !== 0).map((item) => ({ ...item, keyPrefix: 'featured' }))
      );
    }

    r.push({ sectionTitle: `${all.length} ${plur('artist', all.length)}` }, ...all);

    const favorites = all.filter((a) => a.isFavorite);

    if (favorites.length > 0) {
      r.unshift(...favorites.map((item) => ({ ...item, keyPrefix: 'favorites' })));
      r.unshift({ sectionTitle: 'Favorites' });
    }

    return r as ReadonlyArray<Artist> & ReadonlyArray<Artist | RelistenSectionHeader>;
  }, [artists]);

  return (
    <RelistenSectionList
      data={sectionedArtists}
      renderItem={({ item }) => {
        return <ArtistListItem artist={item} />;
      }}
      {...props}
    />
  );
};

export default function Page() {
  const results = useArtists();
  const isDownloadsTab = useIsDownloadsTab();
  const { data: artists } = results;

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        {!isDownloadsTab && (
          <Link
            href={{
              pathname:
                '/relisten/(tabs)/(artists,downloads)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
              params: {
                artistUuid: '77a58ff9-2e01-c59c-b8eb-cff106049b72',
                showUuid: '104c96e5-719f-366f-b72d-8d53709c80e0',
                sourceUuid: 'initial',
              },
            }}
            style={{ padding: 10 }}
          >
            <RelistenText>Barton hall test show</RelistenText>
          </Link>
        )}
        <ArtistsList artists={artists} />
      </RefreshContextProvider>
    </View>
  );
}
