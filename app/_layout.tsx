import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import 'uuid';

import { router, Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Realm } from '@realm/react';

import { RelistenApiProvider } from '@/relisten/api/context';
import { RealmProvider, setRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useRef } from 'react';
import useCacheAssets from './useCacheAssets';
import { RelistenPlayerProvider } from '@/relisten/player/relisten_player';

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function TabLayout() {
  const realmRef = useRef<Realm | null>(null);
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

  useEffect(() => {
    if (realmRef.current) {
      setRealm(realmRef.current);
    } else {
      setRealm(undefined);
    }
  }, [realmRef.current]);

  return (
    <RealmProvider realmRef={realmRef}>
      <RelistenApiProvider>
        <RelistenPlayerProvider>
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
        </RelistenPlayerProvider>
      </RelistenApiProvider>
    </RealmProvider>
  );
}
