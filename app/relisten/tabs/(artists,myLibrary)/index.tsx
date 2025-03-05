import MyLibraryPage from '@/app/relisten/tabs/(artists,myLibrary)/myLibrary';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import {
  Filter,
  FilteringOptions,
  FilteringProvider,
  SortDirection,
} from '@/relisten/components/filtering/filters';
import Flex from '@/relisten/components/flex';
import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenSectionData } from '@/relisten/components/relisten_section_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistMetadata, useArtists } from '@/relisten/realm/models/artist_repo';
import { useRemainingDownloads } from '@/relisten/realm/models/offline_repo';
import { useGroupSegment, useIsDownloadedTab, useRoute } from '@/relisten/util/routes';
import { Link, useNavigation } from 'expo-router';
import plur from 'plur';
import React, { useEffect, useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import Realm from 'realm';

import { YearFilterKey } from '@/relisten/pages/artist/years_filters';

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

export enum ArtistFilterKey {
  Search = 'search',
  Library = 'library',
  Artists = 'artists',
}

const ARTIST_FILTERS: Filter<ArtistFilterKey, Artist>[] = [
  {
    persistenceKey: ArtistFilterKey.Library,
    title: 'My Library',
    active: false,
    filter: (artist) =>
      artist.isFavorite ||
      artist.hasOfflineTracks ||
      artist.sourceTracks.filtered('show.isFavorite == true').length > 0,
    isGlobal: true,
  },
  {
    persistenceKey: ArtistFilterKey.Search,
    title: 'Search',
    active: false,
    searchFilter: (artist, search) => {
      return artist.name.toLowerCase().indexOf(search.toLowerCase()) !== -1;
    },
  },
];

type ArtistsListProps = {
  artists: Realm.Results<Artist>;
  filterOptions: FilteringOptions<ArtistFilterKey>;
} & Omit<FilterableListProps<Artist>, 'data' | 'renderItem'>;

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
    <FilteringProvider filters={ARTIST_FILTERS} options={props.filterOptions}>
      <FilterableList
        data={sectionedArtists}
        renderItem={({ item }) => {
          return <ArtistListItem artist={item} />;
        }}
        {...props}
      />
    </FilteringProvider>
  );
};

export default function Page() {
  const results = useArtists();
  const groupSegment = useGroupSegment();
  const isDownloadedTab = useIsDownloadedTab();
  const { data: artists } = results;

  const downloads = useRemainingDownloads();

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

        <ArtistsList
          artists={artists}
          filterOptions={{
            persistence: { key: 'artists' },
            default: {
              persistenceKey: ArtistFilterKey.Artists,
              sortDirection: SortDirection.Descending,
              active: true,
            },
          }}
        />
      </RefreshContextProvider>
    </View>
  );
}
