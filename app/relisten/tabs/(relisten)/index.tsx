import { Directory, File, Paths } from 'expo-file-system';
import { getFreeDiskStorageAsync, getTotalDiskCapacityAsync } from 'expo-file-system/legacy';
import { StorageDeleteMenu } from '@/relisten/components/menus/storage_delete_menu';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { ScrollView, View } from 'react-native';
import { useCallback, useEffect, useReducer, useState } from 'react';
import Flex from '@/relisten/components/flex';
import {
  OFFLINE_DIRECTORIES_LEGACY,
  OFFLINE_DIRECTORY,
} from '@/relisten/realm/models/source_track';
import { Link, useFocusEffect } from 'expo-router';
import { RelistenSettings } from '@/relisten/components/settings';
import { SectionHeader } from '@/relisten/components/section_header';
import { RowWithAction } from '@/relisten/components/row_with_action';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { RelistenAbout } from '@/relisten/components/about';
import { UpdatesStatusSection } from '@/relisten/components/updates_status_section';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { sample } from 'remeda';
import { useRelistenApi } from '@/relisten/api/context';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { legacyDatabaseExists } from '@/relisten/realm/old_ios_schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LegacyDataMigrationModal, SEEN_MODAL_KEY } from '@/relisten/pages/legacy_migration';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';

const sizeFormatter = new Intl.NumberFormat([], {
  style: 'unit',
  unit: 'gigabyte',
  notation: 'compact',
  unitDisplay: 'narrow',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

// apple uses powers of 10 not powers of 2: https://support.apple.com/en-gb/102119
const BYTE_TO_GB = 1000 * 1000 * 1000;
const formatBytes = (bytes: number) => sizeFormatter.format(bytes / BYTE_TO_GB);

export const useFileSystemInfo = () => {
  const [refreshState, refresh] = useReducer((state) => state + 1, 0);
  const [state, setState] = useState({
    totalDiskSpace: 0,
    totalDiskSpaceFormatted: '',
    totalFreeDiskSpace: 0,
    totalFreeDiskSpaceFormatted: '',
    totalSizeOfRelistenDirectory: 0,
    totalSizeOfRelistenDirectoryFormatted: '',
    totalSizeOfLegacyRelistenDirectory: 0,
    totalSizeOfLegacyRelistenDirectoryFormatted: '',
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [totalDiskSpace, totalFreeDiskSpace] = await Promise.all([
        getTotalDiskCapacityAsync(),
        getFreeDiskStorageAsync(),
      ]);

      const relistenDir = new Directory(OFFLINE_DIRECTORY);
      const relistenDirSize = relistenDir.exists ? (relistenDir.size ?? 0) : 0;

      const legacyTotal = OFFLINE_DIRECTORIES_LEGACY.reduce((acc, legacyPath) => {
        const legacyInfo = Paths.info(legacyPath);
        if (!legacyInfo.exists) {
          return acc;
        }

        if (legacyInfo.isDirectory) {
          const legacyDir = new Directory(legacyPath);
          return acc + (legacyDir.size ?? 0);
        }

        const legacyFile = new File(legacyPath);
        return acc + legacyFile.size;
      }, 0);

      if (cancelled) {
        return;
      }

      setState({
        totalDiskSpace: totalDiskSpace,
        totalDiskSpaceFormatted: formatBytes(totalDiskSpace),
        totalFreeDiskSpace: totalFreeDiskSpace,
        totalFreeDiskSpaceFormatted: formatBytes(totalFreeDiskSpace),
        totalSizeOfRelistenDirectory: relistenDirSize,
        totalSizeOfRelistenDirectoryFormatted: formatBytes(relistenDirSize),
        totalSizeOfLegacyRelistenDirectory: legacyTotal,
        totalSizeOfLegacyRelistenDirectoryFormatted: formatBytes(legacyTotal),
      });
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshState, setState]);

  return [state, refresh] as const;
};

function StorageUsage() {
  const [fileSystemInfo, refresh] = useFileSystemInfo();
  const [hasLegacyData, setHasLegacyData] = useState<boolean>(false);
  const [showMigrationModal, setShowMigrationModal] = useState(false);

  useEffect(() => {
    (async () => {
      setHasLegacyData(await legacyDatabaseExists());
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return (
    <View>
      <SectionHeader title="Storage Usage" />
      <Flex column className="gap-4 p-4 pr-8">
        {hasLegacyData && (
          <RowWithAction
            title={'Migrate legacy data'}
            subtitle={
              'You have legacy data (shows, sources, downloaded tracks) you can try to migrate.'
            }
          >
            <RelistenButton
              onPress={async () => {
                await AsyncStorage.removeItem(SEEN_MODAL_KEY);
                setShowMigrationModal(true);
              }}
            >
              Migrate
            </RelistenButton>
          </RowWithAction>
        )}
        <RowWithAction
          title={'Relisten Storage Usage'}
          subtitle={
            fileSystemInfo.totalSizeOfRelistenDirectoryFormatted +
            (fileSystemInfo.totalSizeOfLegacyRelistenDirectory > 0
              ? ` (legacy ${fileSystemInfo.totalSizeOfLegacyRelistenDirectoryFormatted})`
              : '')
          }
        >
          <StorageDeleteMenu
            canDeleteDownloads={fileSystemInfo.totalSizeOfRelistenDirectory > 0}
            canDeleteLegacy={fileSystemInfo.totalSizeOfLegacyRelistenDirectory > 0}
            onDeleted={refresh}
          />
        </RowWithAction>
        <RowWithAction
          title={'Total Free Storage'}
          subtitle={`${fileSystemInfo.totalFreeDiskSpaceFormatted} out of ${fileSystemInfo.totalDiskSpaceFormatted}`}
        />
      </Flex>
      <LegacyDataMigrationModal
        forceShow={showMigrationModal}
        onDismiss={() => setShowMigrationModal(false)}
      />
    </View>
  );
}

export default function Page() {
  const playerBottomScrollViewProps = usePlayerBottomScrollViewProps();
  const artists = useArtists();
  const { apiClient } = useRelistenApi();
  const { pushShow } = usePushShowRespectingUserSettings();

  const playRandomShow = async () => {
    if (artists.data.length === 0) {
      return;
    }

    const randomArtist = sample([...artists.data], 1)[0]!;
    const randomShow = await apiClient.randomShow(randomArtist.uuid);

    if (randomShow?.data?.uuid) {
      pushShow({
        artist: randomArtist,
        showUuid: randomShow!.data!.uuid,
        overrideGroupSegment: '(artists)',
      });
    }
  };

  return (
    <ScrollScreen>
      <ScrollView className="" {...playerBottomScrollViewProps}>
        <Flex column>
          <Flex column className="gap-4 p-4 pr-8">
            <RowWithAction
              title="Recently Played"
              subtitle="See what other people are listening to in real-time."
            >
              <Link
                href={{
                  pathname: '/relisten/tabs/(relisten)/recently-played' as const,
                }}
                asChild
              >
                <RelistenButton>Recently Played</RelistenButton>
              </Link>
            </RowWithAction>
            <RowWithAction
              title="Random Show"
              subtitle="Listen to a random show by any artist on Relisten."
            >
              <RelistenButton
                automaticLoadingIndicator
                asyncOnPress={playRandomShow}
                disabled={artists.data.length === 0}
              >
                Random Show
              </RelistenButton>
            </RowWithAction>
          </Flex>
          <StorageUsage />

          <RelistenSettings />
          <RelistenAbout />
          <UpdatesStatusSection />
        </Flex>
      </ScrollView>
    </ScrollScreen>
  );
}
