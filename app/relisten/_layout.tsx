import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack } from 'expo-router/stack';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useEffect } from 'react';
import { DownloadManager } from '@/relisten/offline/download_manager';

export const unstable_settings = {
  initialRouteName: 'tabs',
};

export default function TabLayout() {
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (shouldMakeNetworkRequests) {
      timeoutId = setTimeout(() => {
        // wait a few seconds before resume downloads to prevent doing too much right at app launch
        DownloadManager.SHARED_INSTANCE.resumeExistingDownloads().then(() => {});
      }, 5000);

      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
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
      <Stack.Screen name="tabs" />
      <Stack.Screen
        name="player"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          headerShown: true,
          headerStyle: { backgroundColor: RelistenBlue['900'] },
        }}
      />
      <Stack.Screen
        name="audio-adjustments"
        options={{
          contentStyle: { backgroundColor: RelistenBlue['950'] },
          gestureEnabled: false,
          headerShown: false,
          presentation: 'formSheet',
          sheetAllowedDetents: [0.92, 1],
          sheetGrabberVisible: false,
        }}
      />
    </Stack>
  );
}
