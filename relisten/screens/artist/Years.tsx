import Realm from 'realm';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { PropsWithChildren, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { FavoriteObjectButton } from '../../components/favorite_icon_button';
import Flex from '../../components/flex';
import RowSubtitle from '../../components/row_subtitle';
import RowTitle from '../../components/row_title';
import { SectionedListItem } from '../../components/sectioned_list_item';
import { Year } from '../../realm/models/year';
import { AllArtistsTabStackParams } from '../Artist';
import { HomeTabsParamList } from '../Home';
import { useArtistYears } from '../../realm/models/year_repo';
import { memo } from '../../util/memo';
import { RelistenSectionList } from '../../components/relisten_section_list';
import { RefreshContextProvider } from '../../components/refresh_context';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistYears'>;

export const YearsScreen: React.FC<PropsWithChildren<NavigationProps>> = ({ route }) => {
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();
  const { artistUuid } = route.params;

  useEffect(() => {
    navigation.setOptions({ title: 'Years' });
  }, []);

  const results = useArtistYears(artistUuid);
  const {
    data: { years, artist },
  } = results;

  useEffect(() => {
    const yearTitle =
      years.length > 0 ? `${years[0].year}–${years[years.length - 1].year}` : 'Years';
    const artistTitle = artist ? `${artist.name}: ` : '';

    navigation.setOptions({
      title: artistTitle + yearTitle,
    });
  }, [years, artist]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <RefreshContextProvider networkBackedResults={results}>
        <YearsList
          years={years}
          onItemPress={(year: Year) =>
            navigation.navigate('AllArtistsTab', {
              screen: 'ArtistYearShows',
              params: {
                artistUuid: artist!.uuid,
                yearUuid: year.uuid,
              },
            })
          }
        />
      </RefreshContextProvider>
    </View>
  );
};

const YearListItem: React.FC<{
  year: Year;
  onPress?: (year: Year) => void;
}> = memo(({ year, onPress }) => {
  return (
    <SectionedListItem onPress={() => onPress && onPress(year)}>
      <Flex className="justify-between" full>
        <Flex column className="flex-1">
          <RowTitle>{year.year}</RowTitle>
          <Flex className="justify-between">
            <RowSubtitle>
              {year.showCount} shows &middot; {year.sourceCount} tapes
            </RowSubtitle>
          </Flex>
        </Flex>
        <FavoriteObjectButton object={year} />
      </Flex>
    </SectionedListItem>
  );
});

const YearsList: React.FC<{
  years: Realm.Results<Year>;
  onItemPress?: (year: Year) => void;
}> = ({ years, onItemPress }) => {
  const sectionedYears = useMemo(() => {
    const allYears = [...years];
    return [
      { title: 'Favorites', data: allYears.filter((y) => y.isFavorite) },
      { title: `${allYears.length + 1} Years`, data: allYears },
    ];
  }, [years]);

  return (
    <RelistenSectionList
      sections={sectionedYears}
      renderItem={({ item: year }) => {
        return <YearListItem year={year} onPress={onItemPress} />;
      }}
    />
  );
};
