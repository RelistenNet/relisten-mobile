import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import 'react-native-svg';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';

import { Slot, SplashScreen, useNavigationContainerRef } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Realm } from '@realm/react';

import { RelistenApiProvider, useRelistenApi } from '@/relisten/api/context';
import { RealmProvider, setRealm, useRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { StatusBar } from 'expo-status-bar';

import '@/relisten/util/dayjs_setup';
import { useCallback, useEffect, useRef, useState } from 'react';
import useCacheAssets from './useCacheAssets';

import { RelistenPlayerProvider } from '@/relisten/player/relisten_player_hooks';
import { RelistenPlayerBottomBarProvider } from '@/relisten/player/ui/player_bottom_bar';
import { PlayerSheetStateProvider } from '@/relisten/player/ui/player_sheet_state';
import { RelistenCastProvider } from '@/relisten/casting/cast_provider';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import FlashMessage from 'react-native-flash-message';
import { PlaybackHistoryReporterComponent } from '@/relisten/components/playback_history_reporter';
import { LastFmReporterComponent } from '@/relisten/lastfm/lastfm_reporter_component';
import { LastFmAuthListener } from '@/relisten/lastfm/lastfm_auth_listener';
import * as Sentry from '@sentry/react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { LogBox } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCarPlaySetup } from '@/relisten/carplay/useCarPlaySetup';

// c.f. https://github.com/meliorence/react-native-render-html/issues/661#issuecomment-2453476566
LogBox.ignoreLogs([/Support for defaultProps will be removed/]);

SplashScreen.preventAutoHideAsync();

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  // re-enable when react-native-awesome-slider stops logging these continually:
  // Reading from `value` during component render. Please ensure that you do not access the `value` property or use `get` method of a shared value while React is rendering a component.
  strict: false, // Reanimated runs in strict mode by default
});

// Construct a new integration instance. This is needed to communicate between the integration and React
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

if (!__DEV__) {
  Sentry.init({
    dsn: 'https://11ea7022f688b7e51be3d304533ae364@o4508928035717120.ingest.us.sentry.io/4508928038404096',
    debug: __DEV__, // If `true`, Sentry will try to print out useful debugging information if something goes wrong with sending the event. Set it to `false` in production
    tracesSampleRate: 1.0, // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing. Adjusting this value in production.
    integrations: [
      // Pass integration
      navigationIntegration,
      Sentry.feedbackIntegration({
        // @ts-expect-error sentry's typing is off
        imagePicker: ImagePicker,
      }),
    ],
    enableNativeFramesTracking: true, // Tracks slow and frozen frames in the application
    enableAppStartTracking: !__DEV__,
  });
} else {
  Sentry.init({});
}

function RealmBridge() {
  console.log('@alecgorge: RealmBridge');
  const realm = useRealm();

  useEffect(() => {
    setRealm(realm);
    return () => setRealm(undefined);
  }, [realm]);

  return null;
}

function CarPlayBootstrap() {
  console.log('@alecgorge: CarPlayBootstrap');
  const realm = useRealm();
  const { apiClient } = useRelistenApi();

  useCarPlaySetup(apiClient, realm);

  return null;
}

console.log('@alecgorge: _layout.tsx');

function TabLayout() {
  const realmRef = useRef<Realm | null>(null);

  const navigation = useNavigationContainerRef();
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [hasRootViewLayoutFinished, setHasRootViewLayoutFinished] = useState(false);

  const isAppReady = useCacheAssets();

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
          <RelistenCastProvider>
            <PlaybackHistoryReporterComponent />
            <LastFmReporterComponent />
            <LastFmAuthListener />
            <RealmBridge />
            <CarPlayBootstrap />
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
                <PlayerSheetStateProvider>
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
                </PlayerSheetStateProvider>
              </RelistenPlayerBottomBarProvider>
            </ThemeProvider>
          </RelistenCastProvider>
        </RelistenPlayerProvider>
      </RelistenApiProvider>
    </RealmProvider>
  );
}

// Wrap the Root Layout route component with `Sentry.wrap` to capture gesture info and profiling data.
export default Sentry.wrap(TabLayout);
