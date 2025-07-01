import MyLibraryPage from '@/app/relisten/tabs/(artists,myLibrary,offline)/myLibrary';
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
import { useGroupSegment, useIsOfflineTab, useRoute } from '@/relisten/util/routes';
import { Link } from 'expo-router';
import plur from 'plur';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Realm from 'realm';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { SocialButtons } from '@/relisten/components/about';
import { useRealm } from '@/relisten/realm/schema';
import { UserSettings } from '@/relisten/realm/models/user_settings';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { log } from '@/relisten/util/logging';
import { useFileSystemInfo } from '@/app/relisten/tabs/(relisten)';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArtistShowsOnThisDayTray } from '@/relisten/pages/artist/artist_shows_on_this_day_tray';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useRelistenApi } from '@/relisten/api/context';
import { sample } from 'remeda';
import { LegacyDataMigrationModal } from '@/relisten/pages/legacy_migration';

const logger = log.extend('home-screen');

const FavoritesSectionHeader = ({ favorites }: { favorites: Artist[] }) => {
  const { apiClient } = useRelistenApi();
  const { pushShow } = usePushShowRespectingUserSettings();

  const playRandomShow = async () => {
    const randomFavorite = sample([...favorites], 1)[0]!;
    const randomShow = await apiClient.randomShow(randomFavorite.uuid);

    if (randomShow?.data?.uuid) {
      pushShow({
        artist: randomFavorite,
        showUuid: randomShow!.data!.uuid,
        overrideGroupSegment: '(artists)',
      });
    }
  };

  return (
    <View>
      <View className="flex flex-row justify-between items-center px-4">
        <RelistenText className="text-m font-bold">Favorites</RelistenText>
        <RelistenButton className="m-2" asyncOnPress={playRandomShow} automaticLoadingIndicator>
          Random Show
        </RelistenButton>
      </View>
      <ArtistShowsOnThisDayTray artists={favorites} />
    </View>
  );
};

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
  const isOfflineTab = useIsOfflineTab();

  const sectionedArtists = useMemo<RelistenSectionData<Artist>>(() => {
    const r = [];

    const all = [...artists].sort((a, b) => {
      return a.sortName.localeCompare(b.sortName);
    });

    const favorites = all.filter((a) => a.isFavorite);

    if (!isOfflineTab) {
      if (favorites.length > 0) {
        r.push({
          sectionTitle: 'Favorites',
          headerComponent: <FavoritesSectionHeader favorites={favorites} />,
          data: favorites,
        });
      }

      const featured = all.filter((a) => a.featured !== 0);

      r.push({ sectionTitle: 'Featured', data: featured });
    }

    r.push({ sectionTitle: `${all.length} ${plur('artist', all.length)}`, data: all });

    return r;
  }, [artists]);

  const nonIdealState = {
    noData: {
      title: 'No Offline Shows',
      description:
        'After you download something, all of your shows that are available offline will be shown here.',
    },
  };

  return (
    <FilteringProvider filters={ARTIST_FILTERS} options={props.filterOptions}>
      <FilterableList
        data={sectionedArtists}
        renderItem={({ item }) => {
          return <ArtistListItem artist={item} />;
        }}
        nonIdealState={nonIdealState}
        {...props}
      />
    </FilteringProvider>
  );
};

export default function Page() {
  const results = useArtists();
  const groupSegment = useGroupSegment();
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
      <LegacyDataMigrationModal />
    </View>
  );
}
