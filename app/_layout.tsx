import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import 'uuid';
import 'react-native-svg';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';

import { Slot, SplashScreen, useNavigationContainerRef } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Realm } from '@realm/react';

import { RelistenApiProvider } from '@/relisten/api/context';
import { RealmProvider, setRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
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
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { PlaybackHistoryReporterComponent } from '@/relisten/components/playback_history_reporter';
import * as Sentry from '@sentry/react-native';

import { LogBox } from 'react-native';

// c.f. https://github.com/meliorence/react-native-render-html/issues/661#issuecomment-2453476566
LogBox.ignoreLogs([/Support for defaultProps will be removed/]);

dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

SplashScreen.preventAutoHideAsync();

// Construct a new integration instance. This is needed to communicate between the integration and React
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: 'https://11ea7022f688b7e51be3d304533ae364@o4508928035717120.ingest.us.sentry.io/4508928038404096',
  debug: __DEV__, // If `true`, Sentry will try to print out useful debugging information if something goes wrong with sending the event. Set it to `false` in production
  tracesSampleRate: 1.0, // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing. Adjusting this value in production.
  integrations: [
    // Pass integration
    navigationIntegration,
  ],
  enableNativeFramesTracking: true, // Tracks slow and frozen frames in the application
});

function TabLayout() {
  const realmRef = useRef<Realm | null>(null);

  const navigation = useNavigationContainerRef();
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [hasRootViewLayoutFinished, setHasRootViewLayoutFinished] = useState(false);

  const isAppReady = useCacheAssets();

  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();

  useEffect(() => {
    if (realmRef.current) {
      setRealm(realmRef.current);
    } else {
      setRealm(undefined);
    }
  }, [realmRef.current]);

  useEffect(() => {
    if (shouldMakeNetworkRequests) {
      setTimeout(() => {
        // wait a few seconds before resume downloads to prevent doing too much right at app launch
        DownloadManager.SHARED_INSTANCE.resumeExistingDownloads().then(() => {});
      }, 5000);
    }
  }, [shouldMakeNetworkRequests]);

  useEffect(() => {}, []);

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

  useEffect(() => {
    if (navigation?.current) {
      navigationIntegration.registerNavigationContainer(navigation);
    }
  }, [navigation]);

  return (
    <RealmProvider realmRef={realmRef} closeOnUnmount={false}>
      <RelistenApiProvider>
        <RelistenPlayerProvider>
          <PlaybackHistoryReporterComponent />
          <ThemeProvider
            value={{
              dark: true,
              colors: {
                ...DarkTheme.colors,
                primary: 'rgb(0,157,193)',
                background: RelistenBlue[900],
                card: '#001114',
              },
              fonts: DefaultTheme.fonts,
            }}
          >
            <RelistenPlayerBottomBarProvider>
              <ActionSheetProvider>
                <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
                  <SafeAreaProvider>
                    {/* */}
                    <StatusBar style="light" translucent={true} />
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

// Wrap the Root Layout route component with `Sentry.wrap` to capture gesture info and profiling data.
export default Sentry.wrap(TabLayout);
