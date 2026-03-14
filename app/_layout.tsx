import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import 'react-native-svg';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';

import { Slot, SplashScreen, useNavigationContainerRef, usePathname } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Realm } from '@realm/react';
import type { NavigationState, PartialState } from '@react-navigation/native';

import { RelistenApiProvider, useRelistenApi } from '@/relisten/api/context';
import { RealmProvider, setRealm, useRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { StatusBar } from 'expo-status-bar';

import '@/relisten/util/dayjs_setup';
import { useCallback, useEffect, useRef, useState } from 'react';
import useCacheAssets from './useCacheAssets';

import { RelistenPlayerProvider } from '@/relisten/player/relisten_player_hooks';
import { RelistenPlayerBottomBarProvider } from '@/relisten/player/ui/player_bottom_bar';
import { RelistenCastProvider } from '@/relisten/casting/cast_provider';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import FlashMessage from 'react-native-flash-message';
import { PlaybackHistoryReporterComponent } from '@/relisten/components/playback_history_reporter';
import { LastFmReporterComponent } from '@/relisten/lastfm/lastfm_reporter_component';
import { LastFmAuthListener } from '@/relisten/lastfm/lastfm_auth_listener';
import * as Sentry from '@sentry/react-native';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { enableFreeze } from 'react-native-screens';
import { LogBox } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCarPlaySetup } from '@/relisten/carplay/useCarPlaySetup';
import {
  RootServicesProvider,
  useRootLibraryIndex,
  useRootUserSettingsStore,
} from '@/relisten/realm/root_services';
import { routingQueue } from 'expo-router/build/global-state/routing';

// c.f. https://github.com/meliorence/react-native-render-html/issues/661#issuecomment-2453476566
LogBox.ignoreLogs([/Support for defaultProps will be removed/]);
enableFreeze(true);

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
  const realm = useRealm();

  useEffect(() => {
    setRealm(realm);

    return () => {
      // React Strict Mode runs effect cleanup during the initial mount cycle in development.
      // Keep the realm reference stable there to avoid transient startup churn.
      if (!__DEV__) {
        setRealm(undefined);
      }
    };
  }, [realm]);

  return null;
}

function CarPlayBootstrap() {
  const realm = useRealm();
  const { apiClient } = useRelistenApi();
  const libraryIndex = useRootLibraryIndex();
  const userSettingsStore = useRootUserSettingsStore();

  useCarPlaySetup(apiClient, realm, libraryIndex, userSettingsStore);

  return null;
}

function TabLayout() {
  const realmRef = useRef<Realm | null>(null);

  const navigation = useNavigationContainerRef();
  const pathname = usePathname();
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [hasRootViewLayoutFinished, setHasRootViewLayoutFinished] = useState(false);
  const previousPathnameRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);

  const isAppReady = useCacheAssets();

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

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

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    const previousPathname = previousPathnameRef.current;
    if (previousPathname === pathname) {
      return;
    }

    console.log(
      `[RouteDebug] commit ${previousPathname ?? '<initial>'} -> ${pathname} stack=${describeNavigationStack(
        navigation.getRootState()
      )}`
    );
    previousPathnameRef.current = pathname;
  }, [navigation, pathname]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    const originalAdd = routingQueue.add.bind(routingQueue);

    routingQueue.add = (action: Parameters<typeof originalAdd>[0]) => {
      console.log(
        `[RouteDebug] dispatch from=${pathnameRef.current} stack=${describeNavigationStack(
          navigation.getRootState()
        )} action=${describeRoutingQueueAction(action)}`
      );
      return originalAdd(action);
    };

    return () => {
      routingQueue.add = originalAdd;
    };
  }, [navigation]);

  return (
    <RealmProvider realmRef={realmRef} closeOnUnmount={false}>
      <RootServicesProvider>
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
            </RelistenCastProvider>
          </RelistenPlayerProvider>
        </RelistenApiProvider>
      </RootServicesProvider>
    </RealmProvider>
  );
}

function describeRoutingQueueAction(action: unknown) {
  if (!action || typeof action !== 'object' || !('type' in action)) {
    return String(action);
  }

  const type = typeof action.type === 'string' ? action.type : 'unknown';
  const payload =
    'payload' in action && action.payload && typeof action.payload === 'object'
      ? action.payload
      : undefined;

  if (type === 'ROUTER_LINK') {
    const href =
      payload && 'href' in payload && typeof payload.href === 'string' ? payload.href : undefined;
    const options = payload && 'options' in payload ? safeStringify(payload.options) : undefined;

    return [type, href ? `href=${href}` : undefined, options ? `options=${options}` : undefined]
      .filter(Boolean)
      .join(' ');
  }

  const details = payload ? safeStringify(payload) : undefined;

  return [type, details ? `payload=${details}` : undefined].filter(Boolean).join(' ');
}

function safeStringify(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function describeNavigationStack(
  state?: NavigationState | PartialState<NavigationState> | undefined
): string {
  if (!state || !state.routes.length) {
    return '<empty>';
  }

  const routes: string[] = [];
  let currentState: NavigationState | PartialState<NavigationState> | undefined = state;

  while (currentState && currentState.routes.length > 0) {
    const index = currentState.index ?? currentState.routes.length - 1;
    const route = currentState.routes[index] as {
      name: string;
      state?: NavigationState | PartialState<NavigationState>;
    };
    routes.push(route.name);
    currentState =
      route.state && 'routes' in route.state
        ? (route.state as NavigationState | PartialState<NavigationState>)
        : undefined;
  }

  return routes.join(' > ');
}

// Wrap the Root Layout route component with `Sentry.wrap` to capture gesture info and profiling data.
export default Sentry.wrap(TabLayout);
