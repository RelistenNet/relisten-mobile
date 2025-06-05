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
        console.log(favorites);
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

const SEEN_MODAL_KEY = '@relistenapp/seen-v6-upgrade-modal';

function LegacyMigrationModal() {
  const [modalVisible, setModalVisible] = useState(false);
  const [seenModalBefore, setSeenModalBefore] = useState(false);
  const [diskUsage] = useFileSystemInfo();

  useEffect(() => {
    (async () => {
      try {
        const value = await AsyncStorage.getItem(SEEN_MODAL_KEY);
        if (value !== null) {
          setSeenModalBefore(true);
        }
      } catch {
        setSeenModalBefore(false);
      }
    })();
  }, [setSeenModalBefore]);

  useEffect(() => {
    if (diskUsage.totalSizeOfLegacyRelistenDirectoryFormatted !== '') {
      const hasNotDismissed = !seenModalBefore;
      const eligibleForModal = hasNotDismissed && Platform.OS === 'ios';
      const hasLegacyData = diskUsage.totalSizeOfLegacyRelistenDirectory > 0;

      logger.debug(
        `seenModalBefore=${seenModalBefore}, eligibleForModal=${eligibleForModal}, hasLegacyData=${hasLegacyData}`
      );

      if (eligibleForModal && hasLegacyData) {
        setModalVisible(true);
      }
    }
  }, [diskUsage, setModalVisible, seenModalBefore]);

  const clearModal = (deleteLegacyData: boolean) => {
    if (deleteLegacyData) {
      logger.info('Removing all legacy data.');

      DownloadManager.SHARED_INSTANCE.removeAllLegacyDownloads()
        .then(() => {
          logger.info('Removed all legacy data.');
        })
        .catch((e) => {
          logger.error(`Error removing all legacy data: ${e}`);
        });
    }

    (async function () {
      try {
        await AsyncStorage.setItem(SEEN_MODAL_KEY, 'true');
      } catch (e) {
        logger.error(`Error setting ${SEEN_MODAL_KEY}: ${e}`);
      }
    })();
    setModalVisible(false);
  };

  return (
    <>
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(false);
        }}
      >
        <Flex
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
        >
          <Flex
            column
            className="h-5/6 w-10/12 rounded-lg border-2 border-relisten-blue-700 bg-relisten-blue-900 p-4"
          >
            <Image
              source={require('@/assets/Relisten White.png')}
              resizeMode="contain"
              className="mb-2 h-[28] w-full"
            />
            <ScrollView className="grow">
              <RelistenText>
                Welcome to Relisten v6, our first major update in over six years and the 13th update
                in the twelve years since Relisten first launched in October 2013.
                {'\n\n'}
                We've completely rewritten Relisten for improved stability, reliability, exciting
                new features, and Android support (tell your friends!).{' '}
                <Text className="font-bold">
                  Unfortunately, due to significant technical changes, your previous favorites and
                  downloaded shows won't carry over to the new app.{' '}
                </Text>
                We understand how disappointing it is to lose your carefully curated library and
                sincerely apologize—we explored every possible solution to avoid this.
                {'\n\n'}
                You can retain your old data in case future migration becomes possible or delete it
                to start fresh.
                {'\n\n'}
                Thank you for your continued support and understanding! Follow us on Instagram or
                Twitter at @relistenapp, and join our Discord to share feedback and suggestions for
                new futures to add!
                {'\n\n'}
                Keep on truckin'
                {'\n'}
                Alec & Daniel
              </RelistenText>
            </ScrollView>
            <View className="pt-4">
              <SocialButtons className="border-b-2 border-relisten-blue-800 pb-4" />
              <Flex className="w-full justify-stretch pt-4">
                <View className="basis-1/2 pr-1">
                  <RelistenButton onPress={() => clearModal(false)}>
                    Keep data ({diskUsage.totalSizeOfLegacyRelistenDirectoryFormatted})
                  </RelistenButton>
                </View>
                <View className="flex basis-1/2 flex-row items-stretch justify-stretch pl-1">
                  <RelistenButton onPress={() => clearModal(true)} className="flex-1 bg-green-600">
                    Start fresh
                  </RelistenButton>
                </View>
              </Flex>
            </View>
          </Flex>
        </Flex>
      </Modal>
    </>
  );
}

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
      <LegacyMigrationModal />
    </View>
  );
}
