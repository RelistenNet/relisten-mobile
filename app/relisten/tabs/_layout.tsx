import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import ToolbarRelisten from '@/assets/toolbar_relisten.png';
import { useState } from 'react';
import { useRemainingDownloadsCount } from '@/relisten/realm/root_services';
import { shouldShowOfflineTab } from '@/relisten/util/offline_tab_visibility';
import {
  PlayerBarHost,
  renderPlayerBarNativeTabsAccessory,
} from '@/relisten/player/ui/player_bar_host';
import { usePlayerBarPlacementBackend } from '@/relisten/player/ui/player_bar_layout';
import { Image, Platform, View } from 'react-native';

const ACTIVE_TINT = '#009DC1';
const INACTIVE_TINT = 'gray';

function renderTabIcon({
  color,
  focused,
  routeName,
  size,
}: {
  color: string;
  focused: boolean;
  routeName: string;
  size: number;
}) {
  if (routeName === '(artists)') {
    return (
      <MaterialCommunityIcons
        color={color}
        name={focused ? 'account-music' : 'account-music-outline'}
        size={size}
      />
    );
  }

  if (routeName === '(myLibrary)') {
    return <MaterialIcons color={color} name="library-music" size={size} />;
  }

  if (routeName === '(offline)') {
    return <MaterialIcons color={color} name="check-circle" size={size} />;
  }

  return <Image source={ToolbarRelisten} style={{ tintColor: color, width: size, height: size }} />;
}

export default function TabLayout() {
  const downloadsCount = useRemainingDownloadsCount();
  const settings = useUserSettings();
  const offline = !useShouldMakeNetworkRequests();
  const playerBarPlacementBackend = usePlayerBarPlacementBackend();
  const [showOfflineTabOnCompactMobile] = useState(() =>
    shouldShowOfflineTab(settings.showOfflineTabWithDefault(), offline)
  );

  if (Platform.OS === 'android') {
    return (
      <View className="flex-1">
        <Tabs
          screenOptions={({ route }) => ({
            freezeOnBlur: true,
            headerShown: false,
            tabBarActiveTintColor: ACTIVE_TINT,
            tabBarInactiveTintColor: INACTIVE_TINT,
            tabBarIcon: ({ color, focused, size }) =>
              renderTabIcon({ color, focused, routeName: route.name, size }),
          })}
        >
          <Tabs.Screen name="(artists)" options={{ lazy: false, title: 'Artists' }} />
          <Tabs.Screen
            name="(myLibrary)"
            options={{
              lazy: true,
              tabBarBadge: downloadsCount === 0 ? undefined : downloadsCount,
              title: 'My Library',
            }}
          />
          <Tabs.Screen
            name="(offline)"
            options={{
              lazy: true,
              tabBarItemStyle: { display: showOfflineTabOnCompactMobile ? 'flex' : 'none' },
              title: 'Offline',
            }}
          />
          <Tabs.Screen name="(relisten)" options={{ lazy: true, title: 'Relisten' }} />
        </Tabs>
        <PlayerBarHost placementBackend={playerBarPlacementBackend} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <NativeTabs
        backgroundColor={RelistenBlue['950']}
        badgeBackgroundColor={ACTIVE_TINT}
        iconColor={{ default: INACTIVE_TINT, selected: ACTIVE_TINT }}
        labelStyle={{
          default: { color: INACTIVE_TINT },
          selected: { color: ACTIVE_TINT },
        }}
        tintColor={ACTIVE_TINT}
      >
        {renderPlayerBarNativeTabsAccessory(playerBarPlacementBackend)}
        <NativeTabs.Trigger name="(artists)">
          <NativeTabs.Trigger.Icon
            src={
              <NativeTabs.Trigger.VectorIcon family={MaterialCommunityIcons} name="account-music" />
            }
          />
          <NativeTabs.Trigger.Label>Artists</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(myLibrary)">
          <NativeTabs.Trigger.Icon
            src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="library-music" />}
          />
          <NativeTabs.Trigger.Label>My Library</NativeTabs.Trigger.Label>
          {downloadsCount === 0 ? null : (
            <NativeTabs.Trigger.Badge>{String(downloadsCount)}</NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(offline)" hidden={!showOfflineTabOnCompactMobile}>
          <NativeTabs.Trigger.Icon
            src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="check-circle" />}
          />
          <NativeTabs.Trigger.Label>Offline</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(relisten)">
          <NativeTabs.Trigger.Icon
            src={ToolbarRelisten}
            renderingMode="template"
            selectedColor={ACTIVE_TINT}
          />
          <NativeTabs.Trigger.Label>Relisten</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      <PlayerBarHost placementBackend={playerBarPlacementBackend} />
    </View>
  );
}
