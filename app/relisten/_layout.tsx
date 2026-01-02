import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack } from 'expo-router/stack';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useEffect } from 'react';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { useRelistenApi } from '@/relisten/api/context';
import { useRealm } from '@/relisten/realm/schema';
import { useCarPlaySetup } from '@/relisten/carplay/useCarPlaySetup';

export default function TabLayout() {
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();
  const { apiClient } = useRelistenApi();
  const realm = useRealm();

  useCarPlaySetup(apiClient, realm);

  useEffect(() => {
    if (shouldMakeNetworkRequests) {
      setTimeout(() => {
        // wait a few seconds before resume downloads to prevent doing too much right at app launch
        DownloadManager.SHARED_INSTANCE.resumeExistingDownloads().then(() => {});
      }, 5000);
    }
  }, [shouldMakeNetworkRequests]);

  // Test accessing old schema
  // useEffect(() => {
  //   (async () => {
  //     console.log('TRYING OLD SCHEMA');
  //     await oldIosSchema.exampleUsage();
  //   })();
  // }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="player"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerShown: true,
          headerStyle: { backgroundColor: RelistenBlue['900'] },
        }}
      />
      <Stack.Screen name="tabs" />
    </Stack>
  );
}
