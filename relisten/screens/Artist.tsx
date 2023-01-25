import React from 'react';
import { YearsScreen } from './artist/Years';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { YearShowsScreen } from './artist/YearShows';
import { HomeTabsParamList } from './Home';
import { AllArtistsScreen } from './artist/AllArtists';
import { ShowSourcesScreen } from './artist/ShowSources';

type NavigationProps = NativeStackScreenProps<HomeTabsParamList, 'AllArtistsTab'>;

export type AllArtistsTabStackParams = {
  Artists: undefined;
  ArtistYears: { artistId: string };
  ArtistYearShows: { artistId: string; yearId: string };
  ArtistShowSources: { artistId: string; showId: string };
};

const AllArtistsStack = createNativeStackNavigator<AllArtistsTabStackParams>();

export const AllArtistTab: React.FC<NavigationProps> = () => {
  return (
    <AllArtistsStack.Navigator>
      <AllArtistsStack.Screen
        name="Artists"
        component={AllArtistsScreen}
        options={{ title: 'All Artists' }}
      />
      <AllArtistsStack.Screen
        name="ArtistYears"
        component={YearsScreen}
        options={{ title: 'Year' }}
      />
      <AllArtistsStack.Screen
        name="ArtistYearShows"
        component={YearShowsScreen}
        options={{ title: 'Shows' }}
      />
      <AllArtistsStack.Screen
        name="ArtistShowSources"
        component={ShowSourcesScreen}
        options={{ title: 'Show' }}
      />
    </AllArtistsStack.Navigator>
  );
};
