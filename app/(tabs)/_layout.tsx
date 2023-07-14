import { Tabs } from 'expo-router';

import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Image } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';

import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import TabBar from '@/relisten/components/TabBar';
import { RelistenBlue } from '@/relisten/relisten_blue';

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function TabLayout() {
  return (
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
              source={require('../../assets/toolbar_relisten.png')}
              style={{ tintColor: color, width: size, height: size }}
            />
          );
        },
        tabBarActiveTintColor: RelistenBlue['600'],
        tabBarInactiveTintColor: 'gray',
      })}
      tabBar={TabBar}
      // initialRouteName="artists"
    >
      <Tabs.Screen name="artists" options={{ title: 'Artists' }} />
      <Tabs.Screen name="(myLibrary)/myLibrary" options={{ title: 'My Library' }} />
      <Tabs.Screen name="(relisten)/index" options={{ title: 'Relisten' }} />
    </Tabs>
  );
}
