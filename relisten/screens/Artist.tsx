import React from 'react';
import { YearsScreen } from './artist/Years';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { YearShowsScreen } from './artist/YearShows';
import { HomeTabsParamList } from './Home';
import { AllArtistsScreen } from './artist/AllArtists';
import { ShowSourcesScreen } from './artist/ShowSources';

type NavigationProps = NativeStackScreenProps<HomeTabsParamList, 'AllArtistsTab'>;

export type AllArtistsTabStackParams = {
  AllArtists: undefined;
  ArtistYears: { artistId: string };
  ArtistYearShows: { artistId: string; yearId: string };
  ArtistShowSources: { artistId: string; showId: string };
};

const AllArtistsStack = createNativeStackNavigator<AllArtistsTabStackParams>();

export const AllArtistTab: React.FC<{} & NavigationProps> = ({}) => {
  return (
    <AllArtistsStack.Navigator>
      <AllArtistsStack.Screen name="AllArtists" component={AllArtistsScreen} />
      <AllArtistsStack.Screen name="ArtistYears" component={YearsScreen} />
      <AllArtistsStack.Screen name="ArtistYearShows" component={YearShowsScreen} />
      <AllArtistsStack.Screen name="ArtistShowSources" component={ShowSourcesScreen} />
    </AllArtistsStack.Navigator>
  );
};
