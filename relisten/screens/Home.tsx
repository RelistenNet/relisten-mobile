import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AllFavoritesScreen } from './home/AllFavorites';
import { RelistenScreen } from './home/Relisten';
import { AllOfflineScreen } from './home/AllOffline';
import { NavigatorScreenParams } from '@react-navigation/native';
import { AllArtistsTabStackParams, AllArtistTab } from './Artist';

export type HomeTabsParamList = {
  AllArtistsTab: NavigatorScreenParams<AllArtistsTabStackParams>;
  AllFavoritesTab: undefined;
  AllOfflineTab: undefined;
  RelistenTab: undefined;
};

const Tab = createBottomTabNavigator<HomeTabsParamList>();

export const HomeScreen: React.FC = () => {
  return (
    <Tab.Navigator>
      {/* Might need to remove this tab for now. We don't have the APIs for "hot", "trending", etc shows */}
      <Tab.Screen name="RelistenTab" component={RelistenScreen} />
      <Tab.Screen name="AllArtistsTab" component={AllArtistTab} options={{ headerShown: false }} />
      <Tab.Screen name="AllFavoritesTab" component={AllFavoritesScreen} />
      <Tab.Screen name="AllOfflineTab" component={AllOfflineScreen} />
      {/* Future: Playlists tab */}
    </Tab.Navigator>
  );
};
