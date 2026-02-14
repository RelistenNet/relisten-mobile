import { Tabs, usePathname, useRouter, useSegments } from 'expo-router';
import TabBar from '@/relisten/components/TabBar';
import DesktopTabList from '@/relisten/components/DesktopTabList';
import { PlayerSheetHost } from '@/relisten/player/ui/player_sheet_host';
import { EmbeddedPlayerScreen } from '@/relisten/player/ui/player_screen';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Image, View } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useRemainingDownloads } from '@/relisten/realm/models/offline_repo';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { ShowOfflineTabSetting } from '@/relisten/realm/models/user_settings';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useIsDesktopLayout } from '@/relisten/util/layout';
import ToolbarRelisten from '@/assets/toolbar_relisten.png';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isRelistenTabKey, RelistenTabKey, tabKeyToRoute } from '@/relisten/util/tabs';
import { useRelistenPlayerQueueOrderedTracks } from '@/relisten/player/relisten_player_queue_hooks';
import { NonIdealState } from '@/relisten/components/non_ideal_state';

const DESKTOP_SIDEBAR_WIDTH = 220;
const DESKTOP_NOW_PLAYING_WIDTH = 380;
const DEFAULT_TAB_ROUTES: Record<RelistenTabKey, string> = {
  '(artists)': '/relisten/tabs/(artists)',
  '(myLibrary)': '/relisten/tabs/(myLibrary)',
  '(offline)': '/relisten/tabs/(offline)',
  '(relisten)': '/relisten/tabs/(relisten)',
};

export default function TabLayout() {
  const downloads = useRemainingDownloads();
  const settings = useUserSettings();
  const offline = !useShouldMakeNetworkRequests();
  const isDesktopLayout = useIsDesktopLayout();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const activeSegment = segments.at(2);
  const activeTab = isRelistenTabKey(activeSegment) ? activeSegment : '(artists)';
  const [lastTabRoutes, setLastTabRoutes] =
    useState<Record<RelistenTabKey, string>>(DEFAULT_TAB_ROUTES);
  const queueTracks = useRelistenPlayerQueueOrderedTracks();
  const hasPlayback = queueTracks.length > 0;

  useEffect(() => {
    if (!isRelistenTabKey(activeSegment)) {
      return;
    }

    setLastTabRoutes((current) => {
      if (current[activeSegment] === pathname) {
        return current;
      }

      return { ...current, [activeSegment]: pathname };
    });
  }, [activeSegment, pathname]);

  const tabBarComponent = isDesktopLayout ? () => null : TabBar;
  const handleTabSelect = useCallback(
    (key: RelistenTabKey) => {
      if (key === activeTab) {
        return;
      }

      const target = lastTabRoutes[key] ?? tabKeyToRoute(key);
      router.replace(target);
    },
    [activeTab, lastTabRoutes, router]
  );
  const desktopEmptyState = useMemo(
    () => (
      <NonIdealState
        icon="music-off"
        title="Nothing playing"
        description="Pick a show to start listening and it’ll appear here."
      />
    ),
    []
  );

  const tabs = (
    <Tabs
      // initialRouteName="index"
      screenOptions={({ route }) => ({
        headerShown: false,
        headerStyle: {
          backgroundColor: RelistenBlue['950'],
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof MaterialCommunityIcons.glyphMap;

          if (route.name === '(artists)') {
            iconName = focused ? 'account-music' : 'account-music-outline';
            return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
          } else if (route.name === '(myLibrary)') {
            return <MaterialIcons name="library-music" size={size} color={color} />;
          } else if (route.name === '(offline)') {
            return <MaterialIcons name="check-circle" size={size} color={color} />;
          }

          return (
            <Image
              source={ToolbarRelisten}
              style={{ tintColor: color, width: size, height: size }}
            />
          );
        },
        tabBarActiveTintColor: '#009DC1',
        tabBarInactiveTintColor: 'gray',
        ...(isDesktopLayout ? { tabBarStyle: { display: 'none' } } : undefined),
      })}
      tabBar={tabBarComponent}
      // initialRouteName="artists"
    >
      <Tabs.Screen name="(artists)" options={{ title: 'Artists', lazy: false }} />

      <Tabs.Screen
        name="(myLibrary)"
        options={{
          title: 'My Library',
          lazy: false,
          tabBarBadge: downloads.length === 0 ? undefined : downloads.length,
        }}
      />

      <Tabs.Screen
        name="(offline)"
        options={{
          title: 'Offline',
          lazy: false,
          tabBarItemStyle: {
            display:
              settings?.showOfflineTabWithDefault() === ShowOfflineTabSetting.Always ||
              (settings?.showOfflineTabWithDefault() === ShowOfflineTabSetting.WhenOffline &&
                offline)
                ? 'flex'
                : 'none',
          },
        }}
      />

      {/* This one should be lazy to prevent the hits to the fs to check storage */}
      <Tabs.Screen name="(relisten)" options={{ title: 'Relisten', lazy: true }} />
    </Tabs>
  );

  if (isDesktopLayout) {
    return (
      <View className="flex-1 flex-row bg-relisten-blue-950">
        <View
          style={{ width: DESKTOP_SIDEBAR_WIDTH }}
          className="border-r border-relisten-blue-800 bg-relisten-blue-950"
        >
          <DesktopTabList activeKey={activeTab} onSelectTab={handleTabSelect} />
        </View>
        <View className="flex-1">
          {tabs}
          <PlayerSheetHost />
        </View>
        <View
          style={{ width: DESKTOP_NOW_PLAYING_WIDTH }}
          className="border-l border-relisten-blue-800 bg-relisten-blue-900"
        >
          {hasPlayback ? <EmbeddedPlayerScreen /> : desktopEmptyState}
        </View>
      </View>
    );
  }

  return (
    <>
      {tabs}
      <PlayerSheetHost />
    </>
  );
}
