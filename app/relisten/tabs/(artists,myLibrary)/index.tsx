import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import {
  RelistenSectionData,
  RelistenSectionList,
} from '@/relisten/components/relisten_section_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistMetadata, useArtists } from '@/relisten/realm/models/artist_repo';
import { useGroupSegment, useIsDownloadedTab, useRoute } from '@/relisten/util/routes';
import { Link, useNavigation } from 'expo-router';
import plur from 'plur';
import React, { useEffect, useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import Realm from 'realm';
import MyLibraryPage from '@/app/relisten/tabs/(artists,myLibrary)/myLibrary';
import { useRemainingDownloads } from '@/relisten/realm/models/offline_repo';

const ArtistListItem = React.forwardRef(({ artist }: { artist: Artist }, ref) => {
  const nextRoute = useRoute('[artistUuid]');
  const metadata = useArtistMetadata(artist);
  const hasOfflineTracks = artist.hasOfflineTracks;

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
                {hasOfflineTracks && (
                  <>
                    &nbsp;
                    <SourceTrackSucceededIndicator />
                  </>
                )}
              </SubtitleText>
              <SubtitleText>
                <Plur word="tape" count={metadata.sources} />
              </SubtitleText>
            </SubtitleRow>
          </Flex>
        </Flex>
      </SectionedListItem>
    </Link>
  );
});

type ArtistsListProps = {
  artists: Realm.Results<Artist>;
};

const ArtistsList = ({ artists, ...props }: ArtistsListProps) => {
  const isDownloadedTab = useIsDownloadedTab();

  const sectionedArtists = useMemo<RelistenSectionData<Artist>>(() => {
    const r = [];

    const all = [...artists].sort((a, b) => {
      return a.sortName.localeCompare(b.sortName);
    });

    const favorites = all.filter((a) => a.isFavorite);

    if (!isDownloadedTab) {
      if (favorites.length > 0) {
        r.push({
          sectionTitle: 'Favorites',
          data: favorites,
        });
      }

      const featured = all.filter((a) => a.featured !== 0);

      r.push({ sectionTitle: 'Featured', data: featured });
    }

    r.push({ sectionTitle: `${all.length} ${plur('artist', all.length)}`, data: all });

    return r;
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
  const groupSegment = useGroupSegment();
  const isDownloadedTab = useIsDownloadedTab();
  const navigation = useNavigation();
  const { data: artists } = results;

  const downloads = useRemainingDownloads();

  useEffect(() => {
    navigation.setOptions({
      headerShown: groupSegment !== '(myLibrary)',
    });
  }, [groupSegment]);

  if (groupSegment === '(myLibrary)') {
    return <MyLibraryPage />;
  }

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        {downloads.length > 0 && (
          <TouchableOpacity>
            <Link
              href={{
                pathname: `/relisten/tabs/${groupSegment}/downloading`,
              }}
              className="bg-relisten-blue-700 px-4 py-4 text-center"
            >
              <RelistenText>{downloads.length} tracks downloading&nbsp;›</RelistenText>
            </Link>
          </TouchableOpacity>
        )}

        {/* eslint-disable-next-line no-undef */}
        {!isDownloadedTab && __DEV__ && (
          <View>
            <Link
              href={{
                pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
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
          </View>
        )}

        <ArtistsList artists={artists} />
      </RefreshContextProvider>
    </View>
  );
}
