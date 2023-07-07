// https://github.com/uuidjs/uuid#react-native--expo
import 'react-native-get-random-values';
import 'uuid';

import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { RelistenApiProvider } from './relisten/api/context';
import { HomeScreen } from './relisten/screens/Home';

import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration'; // import plugin
import relativeTime from 'dayjs/plugin/relativeTime'; // import plugin
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RealmProvider } from './relisten/realm/schema';

dayjs.extend(duration);
dayjs.extend(relativeTime);

export default function App() {
  return (
    <RealmProvider>
      <SafeAreaProvider>
        <NavigationContainer>
          <RelistenApiProvider>
            <HomeScreen />
            <StatusBar style="auto" />
          </RelistenApiProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </RealmProvider>
  );
}
