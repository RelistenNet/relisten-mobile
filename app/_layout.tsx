import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import 'uuid';

import { router, Slot, SplashScreen, useNavigationContainerRef } from 'expo-router';
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
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useCallback, useEffect, useRef, useState } from 'react';
import useCacheAssets from './useCacheAssets';

import { RelistenPlayerProvider } from '@/relisten/player/relisten_player_hooks';
import { RelistenPlayerBottomBarProvider } from '@/relisten/player/ui/player_bottom_bar';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { DownloadManager } from '@/relisten/offline/download_manager';
import FlashMessage from 'react-native-flash-message';

dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const realmRef = useRef<Realm | null>(null);

  const navigation = useNavigationContainerRef();
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [hasRootViewLayoutFinished, setHasRootViewLayoutFinished] = useState(false);

  const isAppReady = useCacheAssets();

  useEffect(() => {
    if (realmRef.current) {
      setRealm(realmRef.current);
    } else {
      setRealm(undefined);
    }
  }, [realmRef.current]);

  useEffect(() => {
    setTimeout(() => {
      // wait a few seconds before resume downloads to prevent doing too much right at app launch
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = DownloadManager.SHARED_INSTANCE.resumeExistingDownloads();
    }, 5000);
  }, []);

  useEffect(() => {
    if (!navigation?.isReady()) return;

    setIsNavigationReady(true);
  }, [navigation?.isReady(), setIsNavigationReady]);

  // https://docs.expo.dev/versions/latest/sdk/splash-screen/#usage
  const onLayoutRootView = useCallback(async () => {
    if (hasRootViewLayoutFinished) return;

    setHasRootViewLayoutFinished(true);
  }, [hasRootViewLayoutFinished, setHasRootViewLayoutFinished]);

  useEffect(() => {
    if (isAppReady && isNavigationReady && hasRootViewLayoutFinished) {
      SplashScreen.hideAsync();
    }
  }, [isAppReady, isNavigationReady, hasRootViewLayoutFinished]);

  return (
    <RealmProvider realmRef={realmRef} closeOnUnmount={false}>
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
            <RelistenPlayerBottomBarProvider>
              <ActionSheetProvider>
                <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
                  <SafeAreaProvider>
                    <StatusBar style="light" />
                    <Slot />
                    <FlashMessage position="top" />
                  </SafeAreaProvider>
                </GestureHandlerRootView>
              </ActionSheetProvider>
            </RelistenPlayerBottomBarProvider>
          </ThemeProvider>
        </RelistenPlayerProvider>
      </RelistenApiProvider>
    </RealmProvider>
  );
}
