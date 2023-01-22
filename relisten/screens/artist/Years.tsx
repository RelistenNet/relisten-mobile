import React, { PropsWithChildren, useEffect, useMemo } from 'react';
import { ListItem, Text, View } from 'react-native-ui-lib';
import withObservables from '@nozbe/with-observables';
import { LayoutAnimation, SectionList } from 'react-native';
import { database, Favorited } from '../../db/database';
import { DefaultLayoutAnimationConfig } from '../../layout_animation_config';
import { asFavorited } from '../../db/models/favorites';
import { Observable } from 'rxjs';
import { useArtistQuery, useArtistYearsQuery } from '../../db/repos';
import Year from '../../db/models/year';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AllArtistsTabStackParams } from '../Artist';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { HomeTabsParamList } from '../Home';
import { SectionedListItem } from '../../components/sectioned_list_item';
import { SectionHeader } from '../../components/section_header';
import { FavoriteIconButton } from '../../components/favorite_icon_button';
import { mergeRepoQueryResults } from '../../db/repo_query_hook';
import Artist from '../../db/models/artist';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistYears'>;

export const YearsScreen: React.FC<PropsWithChildren<NavigationProps>> = ({ route }) => {
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();
  const { artistId } = route.params;

  useEffect(() => {
    navigation.setOptions({ title: 'Years' });
  }, []);

  const {
    showLoadingIndicator,
    error,
    data: { years, artist },
  } = mergeRepoQueryResults({
    years: useArtistYearsQuery(artistId)(),
    artist: useArtistQuery(artistId)(),
  });

  if (showLoadingIndicator || !years || !artist) {
    return <Text>Loading...</Text>;
  }

  return (
    <View useSafeArea flex style={{ width: '100%' }}>
      <EnhancedYearsList
        years={years}
        artist={artist}
        onItemPress={(year: Year) =>
          navigation.navigate('AllArtistsTab', {
            screen: 'ArtistYearShows',
            params: {
              artistId: year.artist.id!,
              yearId: year.id,
            },
          })
        }
      />
    </View>
  );
};

const YearListItem: React.FC<{
  year: Year;
  isFavorite: boolean;
  onPress?: (year: Year) => void;
}> = ({ year, isFavorite, onPress }) => {
  return (
    <SectionedListItem onPress={() => onPress && onPress(year)}>
      <ListItem.Part middle>
        <View style={{ flexDirection: 'column' }}>
          <Text>{year.year}</Text>
          <Text>
            Shows {year.showCount} — Sources {year.sourceCount}
          </Text>
          <Text>Total Duration {Math.round(year.duration! / 60 / 60)} hours </Text>
        </View>
      </ListItem.Part>
      <ListItem.Part right>
        <FavoriteIconButton
          isFavorited={isFavorite}
          onPress={() => {
            LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
            year.setIsFavorite(!isFavorite);
          }}
        ></FavoriteIconButton>
      </ListItem.Part>
    </SectionedListItem>
  );
};

const enhanceYear = withObservables(['year'], ({ year }: { year: Year }) => ({
  year,
  isFavorite: year.isFavorite,
}));

const EnhancedYearListItem = enhanceYear(YearListItem);

const YearsList: React.FC<{
  years: Favorited<Year>[];
  artist: Artist | undefined;
  onItemPress?: (year: Year) => void;
}> = ({ years, artist, onItemPress }) => {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      title: `${artist?.name}: ${years[0].model.year}–${years[years.length - 1].model.year}`,
    });
  }, [artist, years]);

  const sectionedYears = useMemo(() => {
    return [
      { title: 'Favorites', data: years.filter((a) => a.isFavorite) },
      { title: `${years.length + 1} Years`, data: years },
    ];
  }, [years]);

  return (
    <SectionList
      sections={sectionedYears}
      keyExtractor={(year) => year.model.id}
      renderSectionHeader={({ section: { title } }) => {
        return <SectionHeader title={title} />;
      }}
      renderItem={({ item: year }) => {
        return <EnhancedYearListItem year={year.model} onPress={onItemPress} />;
      }}
    />
  );
};

const enhanceYears = withObservables(
  ['years', 'artist'],
  ({
    years,
    artist,
  }: {
    years: Observable<Year[] | undefined>;
    artist: Observable<Artist | undefined>;
  }) => ({
    years: asFavorited(database, years),
    artist,
  })
);

export const EnhancedYearsList = enhanceYears(YearsList);
