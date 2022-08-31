import React, {PropsWithChildren, useMemo} from "react";
import {NativeStackScreenProps} from "@react-navigation/native-stack";
import {RootStackParamList} from "../../App";
import {ListItem, Text, TouchableOpacity, View} from "react-native-ui-lib";
import withObservables from "@nozbe/with-observables";
import Year from "../db/models/year";
import {LayoutAnimation, SectionList, StyleSheet} from "react-native";
import {DefaultLayoutAnimationConfig} from "../layout_animation_config";
import {database, Favorited} from "../db/database";
import {Observable} from "rxjs";
import {asFavorited} from "../db/models/favorites";
import {useArtistYearsQuery} from "../db/repos";

type NavigationProps = NativeStackScreenProps<RootStackParamList, 'Years'>;

export const YearsScreen: React.FC<PropsWithChildren<{} & NavigationProps>>
    = ({route, navigation}) => {
    const {artistId} = route.params;

    // TODO: load artist object to set title

    const {isLoading, error, data: years, dataSource} = useArtistYearsQuery(artistId)();

    if (isLoading || !years) {
        return <Text>Loading...</Text>;
    }

    return <View useSafeArea flex style={{width: '100%'}}>
        <EnhancedYearsList
            years={years}
            onItemPress={(year: Year) => navigation.navigate('YearShows', {artistId: year.artist.id!, yearId: year.id})}
        />
    </View>;
}

const YearListItem: React.FC<{ year: Year, isFavorite: boolean, onPress?: (year: Year) => void }> =
    ({year, isFavorite, onPress}) => {
        const styles = useYearListItemStyles();

        return (<ListItem style={styles.listItem} onPress={() => onPress && onPress(year)}>
            <ListItem.Part middle>
                <View style={{flexDirection: "column"}}>
                    <Text>{year.year}</Text>
                    <Text>Shows {year.showCount} — Sources {year.sourceCount}</Text>
                    <Text>Total Duration {Math.round(year.duration! / 60 / 60)} hours </Text>
                </View>
            </ListItem.Part>
            <ListItem.Part right>
                <TouchableOpacity onPress={() => {
                    LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
                    year.setIsFavorite(!isFavorite);
                }}>
                    <Text>favorite: {isFavorite ? 'yes' : 'no'}</Text>
                </TouchableOpacity>
            </ListItem.Part>
        </ListItem>);
    };

const enhanceYear = withObservables(['year'], ({year}: { year: Year }) => ({
    year,
    isFavorite: year.isFavorite,
}));

const EnhancedYearListItem = enhanceYear(YearListItem);

const useYearListItemStyles = () => StyleSheet.create({
    listItem: {
        paddingHorizontal: 8,
        width: '100%'
    }
});

const YearsList: React.FC<{ years: Favorited<Year>[], onItemPress?: (year: Year) => void }> = ({years, onItemPress}) => {
    const sectionedYears = useMemo(() => {
        return [
            {title: 'Favorites', data: years.filter(a => a.isFavorite)},
            {title: `${years.length + 1} Years`, data: years}
        ];
    }, [years]);

    return <SectionList
        sections={sectionedYears}
        keyExtractor={year => year.model.id}
        renderSectionHeader={({section: {title}}) => {
            return <Text>{title}</Text>;
        }}
        renderItem={({item: year}) => {
            return <EnhancedYearListItem
                year={year.model}
                onPress={onItemPress}
            />;
        }}
    />;
};

const enhanceYears = withObservables(['years'], ({years}: { years: Observable<Year[] | undefined> }) => ({
    years: asFavorited(database, years)
}));

export const EnhancedYearsList = enhanceYears(YearsList);
