import React, { PropsWithChildren, useEffect } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, View } from 'react-native-ui-lib';
import { useArtistYearShowsQuery, useYearQuery } from '../../db/repos';
import { EnhancedShowsList, ShowList } from '../../components/shows_list';
import Show from '../../db/models/show';
import { AllArtistsTabStackParams } from '../Artist';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { HomeTabsParamList } from '../Home';
import { mergeRepoQueryResults } from '../../db/repo_query_hook';
import withObservables from '@nozbe/with-observables';
import { Observable } from 'rxjs';
import { asFavorited } from '../../db/models/favorites';
import { database, Favorited } from '../../db/database';
import Artist from '../../db/models/artist';
import Year from '../../db/models/year';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistYearShows'>;

export const YearShowsScreen: React.FC<PropsWithChildren<{} & NavigationProps>> = ({ route }) => {
  const { artistId, yearId } = route.params;
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();

  // TODO: load artist and year object to set title

  const {
    showLoadingIndicator,
    error,
    data: { shows, year },
  } = mergeRepoQueryResults({
    shows: useArtistYearShowsQuery(artistId, yearId)(),
    year: useYearQuery(artistId, yearId)(),
  });

  if (showLoadingIndicator || !year || !shows) {
    return <Text>Loading...</Text>;
  }

  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <EnhancedYearShowsList
        year={year}
        shows={shows}
        onItemPress={(show: Show) =>
          navigation.navigate('AllArtistsTab', {
            screen: 'ArtistShowSources',
            params: {
              artistId: artistId,
              showId: show.id,
            },
          })
        }
      />
    </View>
  );
};

export const YearShowsList: React.FC<
  PropsWithChildren<{
    year: Year | undefined;
    shows: Favorited<Show>[];
    onItemPress: (show: Show) => void;
  }>
> = ({ year, shows, onItemPress }) => {
  const navigation = useNavigation();

  useEffect(() => {
    if (year) {
      navigation.setOptions({ title: year.year });
    }
  }, [year]);

  return <ShowList shows={shows} onItemPress={onItemPress} />;
};

const enhanceYearShowsList = withObservables(
  ['shows', 'year'],
  ({
    shows,
    year,
  }: {
    shows: Observable<Show[] | undefined>;
    year: Observable<Year | undefined>;
  }) => ({
    shows: asFavorited(database, shows),
    year,
  })
);

export const EnhancedYearShowsList = enhanceYearShowsList(YearShowsList);
