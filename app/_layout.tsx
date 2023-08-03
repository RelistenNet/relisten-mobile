import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import 'uuid';

import { Slot, router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RelistenApiProvider } from '@/relisten/api/context';
import { RealmProvider } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect } from 'react';
import useCacheAssets from './useCacheAssets';

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function TabLayout() {
  const isAppReady = useCacheAssets();

  useEffect(() => {
    if (isAppReady) {
      // https://github.com/expo/router/issues/740#issuecomment-1629471113
      // TODO: they should fix this bug at some point
      setTimeout(() => {
        router.replace('/(tabs)/artists/');
      }, 1);
    }
  }, [isAppReady]);

  return (
    <RealmProvider>
      <RelistenApiProvider>
        <ThemeProvider
          value={{
            dark: true,
            colors: {
              ...DarkTheme.colors,
              primary: 'rgb(0,157,193)',
              background: RelistenBlue[900],
              card: '#001114',
            },
          }}
        >
          <SafeAreaProvider>
            <StatusBar style="light" />
            <Slot />
          </SafeAreaProvider>
        </ThemeProvider>
      </RelistenApiProvider>
    </RealmProvider>
  );
}
