import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import 'uuid';

import { router, Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Realm } from '@realm/react';
import { SWRConfig } from 'swr';

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

import { RelistenPlayerProvider } from '@/relisten/player/relisten_player_hooks';
import { RelistenPlayerBottomBarProvider } from '@/relisten/player/ui/player_bottom_bar';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { AppState, AppStateStatus } from 'react-native';

dayjs.extend(duration);
dayjs.extend(relativeTime);

function swrMiddleware(useSWRNext) {
  return (key, fetcher, config) => {
    console.log('Requesting', key);
    // fetcher();

    // Handle the next middleware, or the `useSWR` hook if this is the last one.
    const swr = useSWRNext(key, fetcher, config);

    // After hook runs...
    return swr;
  };
}

export default function TabLayout() {
  const realmRef = useRef<Realm | null>(null);
  const isAppReady = useCacheAssets();

  useEffect(() => {
    if (isAppReady) {
      // https://github.com/expo/router/issues/740#issuecomment-1629471113
      // TODO: they should fix this bug at some point
      setTimeout(() => {
        router.replace('/relisten/(tabs)/artists/');
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
    <RealmProvider realmRef={realmRef} closeOnUnmount={false}>
      <SWRConfig
        value={{
          refreshInterval: 60 * 60 * 1000, // 1 hour?
          revalidateIfStale: true,
          revalidateOnFocus: false,
          revalidateOnMount: true,
          use: [swrMiddleware],
          fetcher: (resource, init) => fetch(resource, init).then((res) => res.json()),
          // // https://swr.vercel.app/docs/advanced/react-native
          // // TODO: dont store the raw data, we just want to store that the request happened
          // provider: (cache) => {
          //   console.log(cache);
          //   return new Map(cache);
          // },
          // // we may want to customize these, but for our use-cases
          // // its not so necessary since we can long-cache all data
          // isOnline() {
          //   return true;
          // },
          // isVisible: () => {
          //   return true;
          // },
          // initFocus(callback) {
          //   let appState = AppState.currentState;

          //   const onAppStateChange = (nextAppState: AppStateStatus) => {
          //     /* If it's resuming from background or inactive mode to active one */
          //     if (appState.match(/inactive|background/) && nextAppState === 'active') {
          //       callback();
          //     }
          //     appState = nextAppState;
          //   };

          //   // Subscribe to the app state change events
          //   const subscription = AppState.addEventListener('change', onAppStateChange);

          //   return () => {
          //     subscription.remove();
          //   };
          // },
        }}
      >
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
                  <SafeAreaProvider>
                    <StatusBar style="light" />
                    <Slot />
                  </SafeAreaProvider>
                </ActionSheetProvider>
              </RelistenPlayerBottomBarProvider>
            </ThemeProvider>
          </RelistenPlayerProvider>
        </RelistenApiProvider>
      </SWRConfig>
    </RealmProvider>
  );
}
