import { SafeAreaView } from 'react-native-safe-area-context';

import * as fs from 'expo-file-system';

import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenPlayerPlaybackState } from '@/relisten/player/relisten_player_hooks';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { useRealm } from '@/relisten/realm/schema';
import { DevSettings } from 'react-native';
import { useEffect, useReducer, useState } from 'react';
import Flex from '@/relisten/components/flex';
import { OFFLINE_DIRECTORY } from '@/relisten/realm/models/source_track';

const sizeFormatter = new Intl.NumberFormat([], {
  style: 'unit',
  unit: 'gigabyte',
  notation: 'compact',
  unitDisplay: 'narrow',
});

const BYTE_TO_GB = 1024 * 1024 * 1024;
const formatBytes = (bytes: number) => sizeFormatter.format(bytes / BYTE_TO_GB);

const useFileSystemInfo = () => {
  const [, refresh] = useReducer((state) => state + 1, 0);
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
  }, [state]);

  return [state, refresh] as const;
};

export default function Page() {
  const realm = useRealm();
  const playbackState = useRelistenPlayerPlaybackState();
  const [fileSystemInfo, refresh] = useFileSystemInfo();

  // const play = () => {
  //   player.play({ url: 'https://phish.in/audio/000/012/258/12258.mp3', identifier: '1' });
  //   player.setNextStream({ url: 'https://phish.in/audio/000/012/259/12259.mp3', identifier: '2' });

  //   // setTimeout(() => {
  //   //   player.pause();
  //   // }, 20000);
  // };

  return (
    <SafeAreaView>
      <Flex column cn="gap-2 mt-8">
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
      {/* <TouchableOpacity onPress={play} disabled={playbackState.playback}>
        <Text className="rounded bg-red-500 p-12 text-white">play test</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => player.resume()}
        disabled={playbackState.playback === 'Playing'}
      >
        <Text className="rounded bg-yellow-500 p-12 text-white">RESUME</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => player.seekTo(0.95)}>
        <Text className="rounded bg-green-500 p-12 text-white">skip to 95%</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => player.pause()}
        disabled={playbackState.playback === 'Paused'}
      >
        <Text className="rounded bg-orange-500 p-12 text-white">pause</Text>
      </TouchableOpacity> */}

      <RelistenText>{JSON.stringify(playbackState, null, 2)}</RelistenText>
    </SafeAreaView>
  );
}
