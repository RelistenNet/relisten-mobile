import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigatorScreenParams } from '@react-navigation/native';
import { AllArtistsTabStackParams, AllArtistTab } from './Artist';
import { RelistenScreen } from './home/Relisten';
import { AllLibraryScreen } from './home/AllFavorites';
import { useRealm } from '../realm/schema';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Image } from 'react-native';

export type HomeTabsParamList = {
  AllArtistsTab: NavigatorScreenParams<AllArtistsTabStackParams>;
  AllLibraryTab: undefined;
  RelistenTab: undefined;
};

const Tab = createBottomTabNavigator<HomeTabsParamList>();

export const HomeScreen: React.FC = () => {
  const realm = useRealm();

  console.log('[relisten] Realm path', realm.path);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'AllArtistsTab') {
            iconName = focused ? 'account-music' : 'account-music-outline';
            return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
          } else if (route.name === 'AllLibraryTab') {
            return <MaterialIcons name="library-music" size={size} color={color} />;
          }

          return (
            <Image
              source={require('../../assets/toolbar_relisten.png')}
              style={{ tintColor: color, width: size, height: size }}
            />
          );
        },
        tabBarActiveTintColor: '#009DC1',
        tabBarInactiveTintColor: 'gray',
      })}
    >
      <Tab.Screen
        name="AllArtistsTab"
        component={AllArtistTab}
        options={{ headerShown: false, title: 'All Artists' }}
      />
      <Tab.Screen
        name="AllLibraryTab"
        component={AllLibraryScreen}
        options={{ title: 'Library' }}
      />
      {/* Might need to remove this tab for now. We don't have the APIs for "hot", "trending", etc shows */}
      <Tab.Screen name="RelistenTab" component={RelistenScreen} options={{ title: 'Relisten' }} />
      {/* Future: Playlists tab */}
    </Tab.Navigator>
  );
};
