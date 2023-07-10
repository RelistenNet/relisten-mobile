import Realm from 'realm';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { PropsWithChildren, useEffect, useMemo } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { RelistenText } from '../../components/relisten_text';
import { Artist } from '../../realm/models/artist';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import * as R from 'remeda';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RelistenButton } from '../../components/relisten_button';

type NavigationProps = NativeStackScreenProps<AllArtistsTabStackParams, 'ArtistYears'>;

export const YearsScreen: React.FC<PropsWithChildren<NavigationProps>> = ({ route }) => {
  const navigation = useNavigation<NavigationProp<HomeTabsParamList>>();
  const { artistUuid } = route.params;

  useEffect(() => {
    navigation.setOptions({ title: '' });
  }, []);

  const results = useArtistYears(artistUuid);
  const {
    data: { years, artist },
  } = results;

  return (
    <SafeAreaView edges={{ bottom: 'off', top: 'additive' }} className="flex-1">
      <RefreshContextProvider networkBackedResults={results}>
        <YearsList
          artist={artist}
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
    </SafeAreaView>
  );
};

const YearsHeader: React.FC<{ artist: Artist | null; years: ReadonlyArray<Year> }> = memo(
  ({ artist, years }) => {
    if (!artist || years.length === 0) {
      return null;
    }

    const totalShows = R.sumBy(years, (y) => y.showCount);
    const totalTapes = R.sumBy(years, (y) => y.sourceCount);

    return (
      <View className="flex w-full items-center pb-1">
        <View className="w-full px-4 pb-4">
          <RelistenText
            className="w-full py-2 pt-8 text-center text-4xl font-bold text-white"
            selectable={false}
          >
            {artist.name}
          </RelistenText>
          <RelistenText className="w-full pb-2 text-center text-xl" selectable={false}>
            {years[0].year}&ndash;{years[years.length - 1].year}
          </RelistenText>
          <RelistenText className="text-l w-full pb-2 text-center italic text-slate-400">
            {[years.length + ' years', totalShows + ' shows', totalTapes + ' tapes'].join(' • ')}
          </RelistenText>
        </View>
        <View className="w-full flex-row px-4 pb-4" style={{ gap: 16 }}>
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Venues
          </RelistenButton>
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Tours
          </RelistenButton>
          <RelistenButton className="shrink basis-1/3" textClassName="text-l">
            Songs
          </RelistenButton>
        </View>
        <ScrollView horizontal className="w-full pb-3">
          <View className="flex w-full flex-row justify-start px-4" style={{ gap: 8 }}>
            <TouchableOpacity className="flex flex-row items-center rounded-xl bg-relisten-blue-600 p-1 px-2">
              <MaterialCommunityIcons name="sort-ascending" color="white" size={16} />
              <View className="w-[4]" />
              <RelistenText className="text-base font-bold">Year</RelistenText>
            </TouchableOpacity>
            <TouchableOpacity className="flex flex-row items-center rounded-xl bg-relisten-blue-800 p-1 px-2">
              <MaterialCommunityIcons name="sort-ascending" color="white" size={16} />
              <View className="w-[4]" />
              <RelistenText className="text-base font-bold">Shows</RelistenText>
            </TouchableOpacity>
            <TouchableOpacity className="flex flex-row items-center rounded-xl bg-relisten-blue-800 p-1 px-2">
              <MaterialCommunityIcons name="sort-ascending" color="white" size={16} />
              <View className="w-[4]" />
              <RelistenText className="text-base font-bold">Tapes</RelistenText>
            </TouchableOpacity>
            <TouchableOpacity className="flex flex-row items-center rounded-xl bg-relisten-blue-800 p-1 px-2">
              <MaterialCommunityIcons name="check-circle-outline" color="white" size={16} />
              <View className="w-[4]" />
              <RelistenText className="text-base font-bold">My Library</RelistenText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }
);

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
  artist: Artist | null;
  years: Realm.Results<Year>;
  onItemPress?: (year: Year) => void;
}> = ({ artist, years, onItemPress }) => {
  const sectionedYears = useMemo(() => {
    const allYears = [...years];
    return [
      { title: 'Favorites', data: allYears.filter((y) => y.isFavorite) },
      { title: `${allYears.length + 1} Years`, data: allYears },
    ];
  }, [years]);

  return (
    <RelistenSectionList
      ListHeaderComponent={<YearsHeader artist={artist} years={years} />}
      sections={sectionedYears}
      renderItem={({ item: year }) => {
        return <YearListItem year={year} onPress={onItemPress} />;
      }}
    />
  );
};
