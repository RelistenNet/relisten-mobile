// https://github.com/uuidjs/uuid#react-native--expo
import 'react-native-get-random-values';
import 'uuid';

require('react-native-ui-lib/config').setConfig({ appScheme: 'dark' });

import { Colors } from 'react-native-ui-lib';

Colors.loadSchemes({
  light: {
    screenBG: 'transparent',
    textColor: Colors.grey10,
    moonOrSun: Colors.yellow30,
    mountainForeground: Colors.green30,
    mountainBackground: Colors.green50,
  },
  dark: {
    screenBG: Colors.grey10,
    textColor: Colors.white,
    moonOrSun: Colors.grey80,
    mountainForeground: Colors.violet10,
    mountainBackground: Colors.violet20,
  },
});

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
