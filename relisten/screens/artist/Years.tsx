import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useObservableState } from 'observable-hooks';
import React, { PropsWithChildren, useEffect, useMemo } from 'react';
import { LayoutAnimation, SectionList } from 'react-native';
import { Text, View } from 'react-native-ui-lib';
import { FavoriteIconButton } from '../../components/favorite_icon_button';
import Flex from '../../components/flex';
import RowSubtitle from '../../components/row_subtitle';
import RowTitle from '../../components/row_title';
import { SectionedListItem } from '../../components/sectioned_list_item';
import { SectionHeader } from '../../components/section_header';
import { database, Favorited } from '../../db/database';
import { useFavoritedQuery } from '../../db/models/favorites';
import Year from '../../db/models/year';
import { useArtistQuery, useArtistYearsQuery } from '../../db/repos';
import { mergeRepoQueryResults } from '../../db/repo_query_hook';
import { DefaultLayoutAnimationConfig } from '../../layout_animation_config';
import { AllArtistsTabStackParams } from '../Artist';
import { HomeTabsParamList } from '../Home';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistYears'>;

export const YearsScreen: React.FC<PropsWithChildren<NavigationProps>> = ({ route }) => {
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();
  const { artistId } = route.params;
  const yearsQuery = useQuery<any[]>(['/artists/' + artistId + '/years']);

  const artistsQuery = useQuery<any[]>(['/artists']);
  console.log(yearsQuery.isError, artistsQuery.isLoading);

  const years = yearsQuery.data;
  const artist = artistsQuery.data?.find((artist) => artist.uuid === artistId);
  useEffect(() => {
    navigation.setOptions({ title: 'Years' });
  }, []);

  // const {
  //   showLoadingIndicator,
  //   error,
  //   data: { years: rawYears$, artist: artist$ },
  // } = mergeRepoQueryResults({
  //   years: useArtistYearsQuery(artistId)(),
  //   artist: useArtistQuery(artistId)(),
  // });

  // const years$ = useFavoritedQuery(database, rawYears$);
  // const years = useObservableState(years$);
  // const artist = useObservableState(artist$);

  useEffect(() => {
    const yearTitle = years?.length ? `${years[0].year}–${years[years.length - 1].year}` : 'Years';
    const artistTitle = artist ? `${artist.name}: ` : '';

    navigation.setOptions({
      title: artistTitle + yearTitle,
    });
  }, [artist, years]);

  if (yearsQuery.isLoading || !years || !artist) {
    return <Text>Loading...</Text>;
  }

  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <YearsList
        years={years}
        onItemPress={(year: Year) =>
          navigation.navigate('AllArtistsTab', {
            screen: 'ArtistYearShows',
            params: {
              artistId: artist.uuid!,
              yearId: year.uuid,
            },
          })
        }
      />
    </View>
  );
};

const YearListItem: React.FC<{
  year: Year;
  onPress?: (year: Year) => void;
}> = ({ year, onPress }) => {
  // const isFavorite = useObservableState(year.isFavorite) || false;
  const isFavorite = false;

  return (
    <SectionedListItem onPress={() => onPress && onPress(year)}>
      <Flex className="justify-between" full>
        <Flex column className="flex-1">
          <RowTitle>{year.year}</RowTitle>
          <Flex className="justify-between">
            <RowSubtitle>
              {year.show_count} shows &middot; {year.source_count} tapes
            </RowSubtitle>
          </Flex>
        </Flex>
        <FavoriteIconButton
          isFavorited={isFavorite}
          onPress={() => {
            LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
            year.setIsFavorite(!isFavorite);
          }}
        ></FavoriteIconButton>
      </Flex>
    </SectionedListItem>
  );
};

const YearsList: React.FC<{
  years: Favorited<Year>[];
  onItemPress?: (year: Year) => void;
}> = ({ years, onItemPress }) => {
  const sectionedYears = useMemo(() => {
    return [
      { title: 'Favorites', data: years.filter((a) => a.isFavorite) },
      { title: `${years.length + 1} Years`, data: years },
    ];
  }, [years]);

  return (
    <SectionList
      sections={sectionedYears}
      keyExtractor={(year) => year.uuid}
      renderSectionHeader={({ section: { title } }) => {
        return <SectionHeader title={title} />;
      }}
      renderItem={({ item: year }) => {
        return <YearListItem year={year} onPress={onItemPress} />;
      }}
    />
  );
};
