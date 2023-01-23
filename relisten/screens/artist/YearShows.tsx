import React, { PropsWithChildren, useEffect } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, View } from 'react-native-ui-lib';
import { useArtistYearShowsQuery, useYearQuery } from '../../db/repos';
import { ShowList } from '../../components/shows_list';
import Show from '../../db/models/show';
import { AllArtistsTabStackParams } from '../Artist';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { HomeTabsParamList } from '../Home';
import { mergeRepoQueryResults } from '../../db/repo_query_hook';
import { useFavoritedQuery } from '../../db/models/favorites';
import { useObservableState } from 'observable-hooks';
import { database } from '../../db/database';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistYearShows'>;

export const YearShowsScreen: React.FC<PropsWithChildren<{} & NavigationProps>> = ({ route }) => {
  const { artistId, yearId } = route.params;
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();

  const {
    showLoadingIndicator,
    error,
    data: { shows: rawShows$, year: year$ },
  } = mergeRepoQueryResults({
    shows: useArtistYearShowsQuery(artistId, yearId)(),
    year: useYearQuery(artistId, yearId)(),
  });

  const shows$ = useFavoritedQuery(database, rawShows$);
  const shows = useObservableState(shows$);
  const year = useObservableState(year$);

  useEffect(() => {
    if (year) {
      navigation.setOptions({ title: year.year });
    } else {
      navigation.setOptions({ title: 'Shows' });
    }
  }, [year]);

  if (showLoadingIndicator || !year || !shows) {
    return <Text>Loading...</Text>;
  }

  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <ShowList
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
