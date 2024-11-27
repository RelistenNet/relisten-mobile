import { Tabs } from 'expo-router';
import { useQuery } from '@/relisten/realm/schema';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import TabBar from '@/relisten/components/TabBar';
import { PlayerBottomBar } from '@/relisten/player/ui/player_bottom_bar';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Image } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';

export default function TabLayout() {
  const downloads = useQuery(SourceTrackOfflineInfo, (query) =>
    query.filtered('status != $0', SourceTrackOfflineInfoStatus.Succeeded)
  );

  return (
    <>
      <Tabs
        initialRouteName="index"
        screenOptions={({ route }) => ({
          headerShown: false,
          headerStyle: {
            backgroundColor: RelistenBlue['950'],
          },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            console.log(route.name, route);

            if (route.name === '(artists)') {
              iconName = focused ? 'account-music' : 'account-music-outline';
              return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
            } else if (route.name === '(downloaded)') {
              iconName = focused ? 'download' : 'download-outline';
              return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
            } else if (route.name === '(myLibrary)') {
              return <MaterialIcons name="library-music" size={size} color={color} />;
            }

            return (
              <Image
                source={require('../../../assets/toolbar_relisten.png')}
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
        <Tabs.Screen name="(artists)" options={{ title: 'Artists' }} />
        <Tabs.Screen
          name="(downloaded)"
          options={{
            title: 'Downloads',
            tabBarBadge: downloads.length === 0 ? undefined : downloads.length,
          }}
        />

        <Tabs.Screen name="(myLibrary)" options={{ title: 'My Library', headerShown: false }} />
        <Tabs.Screen name="(relisten)/index" options={{ title: 'Relisten' }} />
      </Tabs>
      <PlayerBottomBar />
    </>
  );
}
