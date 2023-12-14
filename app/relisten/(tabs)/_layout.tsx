import { Tabs } from 'expo-router';

import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Image } from 'react-native';
// import 'react-native-gesture-handler';
import 'react-native-reanimated';
import TabBar from '@/relisten/components/TabBar';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { PlayerBottomBar } from '@/relisten/player/ui/player_bottom_bar';

export default function TabLayout() {
  return (
    <>
      <Tabs
        initialRouteName="artists"
        screenOptions={({ route }) => ({
          headerShown: false,
          headerStyle: {
            backgroundColor: RelistenBlue['950'],
          },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            if (route.name === 'artists') {
              iconName = focused ? 'account-music' : 'account-music-outline';
              return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
            } else if (route.name === '(myLibrary)/myLibrary') {
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
        <Tabs.Screen name="artists" options={{ title: 'Artists' }} />
        <Tabs.Screen name="(myLibrary)/myLibrary" options={{ title: 'My Library' }} />
        <Tabs.Screen name="(relisten)/index" options={{ title: 'Relisten' }} />
      </Tabs>
      <PlayerBottomBar />
    </>
  );
}
