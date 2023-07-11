import React from 'react';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeTabsParamList } from './Home';
import { AllArtistsScreen } from './artist/AllArtists';
import { YearsScreen } from './artist/Years';
import { YearShowsScreen } from './artist/YearShows';
import { ShowSourcesScreen } from './artist/ShowSources';

type NavigationProps = NativeStackScreenProps<HomeTabsParamList, 'AllArtistsTab'>;

export type AllArtistsTabStackParams = {
  AllArtists: undefined;
  ArtistYears: { artistUuid: string };
  ArtistYearShows: { artistUuid: string; yearUuid: string };
  ArtistShowSources: { artistUuid: string; showUuid: string };
};

const AllArtistsStack = createNativeStackNavigator<AllArtistsTabStackParams>();

export const AllArtistTab: React.FC<{} & NavigationProps> = ({}) => {
  return (
    <AllArtistsStack.Navigator screenOptions={{ headerBackTitleVisible: false }}>
      <AllArtistsStack.Screen
        name="AllArtists"
        component={AllArtistsScreen}
        options={{ title: 'All Artists' }}
      />
      <AllArtistsStack.Screen name="ArtistYears" component={YearsScreen} options={{ title: '' }} />
      <AllArtistsStack.Screen
        name="ArtistYearShows"
        component={YearShowsScreen}
        options={{ title: 'Shows' }}
      />
      <AllArtistsStack.Screen
        name="ArtistShowSources"
        component={ShowSourcesScreen}
        options={{ title: '' }}
      />
    </AllArtistsStack.Navigator>
  );
};
