import { Tabs } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RelistenApiProvider } from '@/relisten/api/context';
import { RealmProvider } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Text, View } from 'react-native';

// import { AllArtistsScreen } from '@/relisten/screens/artist/AllArtists';

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
            <Tabs
              screenOptions={{
                headerShown: false,
                headerStyle: {
                  backgroundColor: 'green',
                },
              }}
              // initialRouteName="artists"
            >
              <Tabs.Screen name="artists" options={{ title: 'Artists' }} />
              <Tabs.Screen name="(myLibrary)/myLibrary" options={{ title: 'Tab Two' }} />
            </Tabs>
            <View className="flex h-24 items-center justify-center">
              <Text>Look, this is always visible (if we want it to be)!</Text>
            </View>
          </SafeAreaProvider>
        </ThemeProvider>
      </RelistenApiProvider>
    </RealmProvider>
  );
}
