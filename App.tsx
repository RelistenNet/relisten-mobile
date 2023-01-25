// https://github.com/uuidjs/uuid#react-native--expo

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
  persistQueryClientRestore,
} from '@tanstack/react-query-persist-client';
import 'react-native-get-random-values';
import 'uuid';

import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { RelistenApiProvider } from './relisten/api/context';
import { HomeScreen } from './relisten/screens/Home';

import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import axios from 'axios';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

const BASE_URL = 'https://api.relisten.net/api/v3';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      cacheTime: 1000 * 60 * 60 * 24, // 24 hours
      queryFn: async ({ queryKey }) => {
        console.log(queryKey);
        const [url] = queryKey;
        if (typeof url === 'string') {
          console.log(`${BASE_URL}${url.toLowerCase()}`);
          const data = await axios
            .get(`${BASE_URL}${url.toLowerCase()}`, {
              headers: {
                'Content-Type': 'application/json',
              },
            })
            .then((res) => res.data);

          return data;
        }
        throw new Error('Invalid QueryKey');
      },
    },
  },
});

// onlineManager.setEventListener((setOnline) => {
//   return NetInfo.addEventListener((state) => {
//     setOnline(!!state.isConnected);
//   });
// });

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
});

export default function App() {
  useEffect(() => {
    persistQueryClientRestore({
      queryClient,
      persister,
    });
    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => subscription.remove();
  }, []);

  return (
    <NavigationContainer>
      <RelistenApiProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
          <HomeScreen />
          <StatusBar style="auto" />
        </PersistQueryClientProvider>
      </RelistenApiProvider>
    </NavigationContainer>
  );
}
