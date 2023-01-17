// https://github.com/uuidjs/uuid#react-native--expo
import 'react-native-get-random-values';
import 'uuid';

import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { RelistenApiProvider } from './relisten/api/context';
import { HomeScreen } from './relisten/screens/Home';

export default function App() {
  return (
    <NavigationContainer>
      <RelistenApiProvider>
        <HomeScreen />
        <StatusBar style="auto" />
      </RelistenApiProvider>
    </NavigationContainer>
  );
}
