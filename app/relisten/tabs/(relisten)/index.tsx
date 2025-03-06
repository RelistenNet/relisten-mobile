import * as fs from 'expo-file-system';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { useRealm } from '@/relisten/realm/schema';
import { ActivityIndicator, DevSettings, ScrollView, View } from 'react-native';
import { useCallback, useEffect, useReducer, useState } from 'react';
import Flex from '@/relisten/components/flex';
import { OFFLINE_DIRECTORY } from '@/relisten/realm/models/source_track';
import { Link, useFocusEffect } from 'expo-router';
import { RelistenSettings } from '@/relisten/components/settings';
import { SectionHeader } from '@/relisten/components/section_header';
import { RowWithAction } from '@/relisten/components/row_with_action';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { log } from '@/relisten/util/logging';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { RelistenAbout } from '@/relisten/components/about';

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

const useFileSystemInfo = () => {
  const [refreshState, refresh] = useReducer((state) => state + 1, 0);
  const [state, setState] = useState({
    totalDiskSpace: '',
    totalFreeDiskSpace: '',
    totalSizeOfRelistenDirectory: '',
  });

  useEffect(() => {
    (async () => {
      const [totalDiskSpace, totalFreeDiskSpace, dirInfo] = await Promise.all([
        fs.getTotalDiskCapacityAsync(),
        fs.getFreeDiskStorageAsync(),
        fs.getInfoAsync(OFFLINE_DIRECTORY),
      ]);

      setState({
        totalDiskSpace: formatBytes(totalDiskSpace),
        totalFreeDiskSpace: formatBytes(totalFreeDiskSpace),
        totalSizeOfRelistenDirectory: formatBytes(dirInfo.exists ? dirInfo.size : 0),
      });
    })();
  }, [refreshState, setState]);

  return [state, refresh] as const;
};

const logger = log.extend('storage-usage');

function StorageUsage() {
  const [fileSystemInfo, refresh] = useFileSystemInfo();
  const { showActionSheetWithOptions } = useActionSheet();
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const deleteOffline = () => {
    showActionSheetWithOptions(
      {
        options: ['Delete all downloaded tracks', 'Cancel'],
        cancelButtonIndex: 1,
        destructiveButtonIndex: 0,
        title: 'Are you sure you want to delete your downloaded tracks?',
        message:
          'Deleting all downloaded tracks will free up storage space, but you will not be able to play any songs without access to the Internet.',
      },
      (selectedIdx?: number) => {
        if (selectedIdx === 0) {
          DownloadManager.SHARED_INSTANCE.removeAllDownloads()
            .then(() => {
              logger.info('Deleted all downloads');
            })
            .catch((reason) => {
              logger.error(`Error deleting downloads: ${JSON.stringify(reason)}`);
            })
            .finally(() => {
              setDeleting(false);
              refresh();
            });

          setDeleting(true);
        }
      }
    );
  };

  return (
    <View>
      <SectionHeader title="Storage Usage" />
      <Flex column className="gap-4 p-4">
        <RowWithAction
          title={'Relisten Storage Usage'}
          subtitle={fileSystemInfo.totalSizeOfRelistenDirectory}
        >
          <RelistenButton
            icon={deleting && <ActivityIndicator size={8} className="mr-2" />}
            onPress={deleteOffline}
            disabled={deleting}
          >
            Delete
          </RelistenButton>
        </RowWithAction>
        <RowWithAction
          title={'Total Free Storage'}
          subtitle={`${fileSystemInfo.totalFreeDiskSpace} out of ${fileSystemInfo.totalDiskSpace}`}
        />
      </Flex>
    </View>
  );
}

export default function Page() {
  const realm = useRealm();

  return (
    <ScrollScreen>
      <ScrollView className="">
        <Flex column>
          <View className="p-4">
            <RowWithAction
              title="Today in History"
              subtitle="See every show by every band played on this day in history."
            >
              <Link
                href={{
                  pathname: '/relisten/tabs/(relisten)/today' as const,
                }}
                asChild
              >
                <RelistenButton>Today in History</RelistenButton>
              </Link>
            </RowWithAction>
          </View>
          <StorageUsage />

          <RelistenSettings />
          <RelistenAbout />
        </Flex>
      </ScrollView>
    </ScrollScreen>
  );
}
