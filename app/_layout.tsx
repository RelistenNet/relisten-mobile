import { Tabs } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RelistenApiProvider } from '@/relisten/api/context';
import { RealmProvider } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'react-native';
import 'react-native-reanimated';
import 'react-native-gesture-handler';

import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import PlaybackBar from './PlaybackBar';

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function TabLayout() {
  return (
    <RealmProvider>
      <RelistenApiProvider>
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
          <SafeAreaProvider>
            <StatusBar style="light" />

            <Tabs
              initialRouteName="artists"
              screenOptions={({ route }) => ({
                headerShown: false,
                headerStyle: {
                  backgroundColor: 'green',
                },
                tabBarIcon: ({ focused, color, size }) => {
                  let iconName;

                  if (route.name === 'artists') {
                    iconName = focused ? 'account-music' : 'account-music-outline';
                    return (
                      <MaterialCommunityIcons name={iconName as any} size={size} color={color} />
                    );
                  } else if (route.name === '(myLibrary)/myLibrary') {
                    return <MaterialIcons name="library-music" size={size} color={color} />;
                  }

                  return (
                    <Image
                      source={require('../assets/toolbar_relisten.png')}
                      style={{ tintColor: color, width: size, height: size }}
                    />
                  );
                },
                tabBarActiveTintColor: '#009DC1',
                tabBarInactiveTintColor: 'gray',
              })}
              // initialRouteName="artists"
            >
              <Tabs.Screen name="artists" options={{ title: 'Artists' }} />
              <Tabs.Screen name="(myLibrary)/myLibrary" options={{ title: 'My Library' }} />
              <Tabs.Screen name="(relisten)/index" options={{ title: 'Relisten' }} />
            </Tabs>
            <PlaybackBar />
          </SafeAreaProvider>
        </ThemeProvider>
      </RelistenApiProvider>
    </RealmProvider>
  );
}
