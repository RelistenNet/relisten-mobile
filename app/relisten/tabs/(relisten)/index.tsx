import { SafeAreaView } from 'react-native-safe-area-context';

import * as fs from 'expo-file-system';

import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { useRealm } from '@/relisten/realm/schema';
import { DevSettings } from 'react-native';
import { useEffect, useReducer, useState } from 'react';
import Flex from '@/relisten/components/flex';
import { OFFLINE_DIRECTORY } from '@/relisten/realm/models/source_track';
import { Link } from 'expo-router';

const sizeFormatter = new Intl.NumberFormat([], {
  style: 'unit',
  unit: 'gigabyte',
  notation: 'compact',
  unitDisplay: 'narrow',
});

const BYTE_TO_GB = 1024 * 1024 * 1024;
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

export default function Page() {
  const realm = useRealm();
  const [fileSystemInfo, refresh] = useFileSystemInfo();

  return (
    <Flex column cn="gap-2 mt-8">
      <Link
        href={{
          pathname: '/relisten/tabs/(relisten)/today' as const,
        }}
        asChild
      >
        <RelistenButton>Today in History</RelistenButton>
      </Link>
      <RelistenButton
        onPress={async () => {
          if ((await fs.getInfoAsync(OFFLINE_DIRECTORY)).exists) {
            await fs.deleteAsync(OFFLINE_DIRECTORY);
            refresh();
          }
          realm.beginTransaction();
          realm.deleteAll();
          realm.commitTransaction();
          DevSettings.reload();
        }}
      >
        Reset Realm Cache & Delete Local Files
      </RelistenButton>

      <RelistenText>{JSON.stringify(fileSystemInfo, null, 2)}</RelistenText>
    </Flex>
  );
}
