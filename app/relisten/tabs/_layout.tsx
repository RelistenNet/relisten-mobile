import { Tabs } from 'expo-router';
import TabBar from '@/relisten/components/TabBar';
import { PlayerBottomBar } from '@/relisten/player/ui/player_bottom_bar';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Image } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useRemainingDownloads } from '@/relisten/realm/models/offline_repo';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { ShowOfflineTabSetting } from '@/relisten/realm/models/user_settings';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import ToolbarRelisten from '@/assets/toolbar_relisten.png';

export default function TabLayout() {
  const downloads = useRemainingDownloads();
  const settings = useUserSettings();
  const offline = !useShouldMakeNetworkRequests();

  return (
    <>
      <Tabs
        // initialRouteName="index"
        screenOptions={({ route }) => ({
          headerShown: false,
          headerStyle: {
            backgroundColor: RelistenBlue['950'],
          },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

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
        })}
        tabBar={TabBar}
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
      <PlayerBottomBar />
    </>
  );
}
