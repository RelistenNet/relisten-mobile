import React, {PropsWithChildren, useMemo} from "react";
import {LayoutAnimation, SectionList, StyleSheet} from "react-native";
import {useAllArtistsQuery} from "../db/repos";
import withObservables from '@nozbe/with-observables';
import Artist from "../db/models/artist";
import {ListItem, Text, TouchableOpacity, View} from "react-native-ui-lib";
import {Observable} from "rxjs";
import {database, Favorited} from "../db/database";
import {DefaultLayoutAnimationConfig} from "../layout_animation_config";
import {asFavorited} from "../db/models/favorites";
import {NativeStackScreenProps} from "@react-navigation/native-stack";
import {RootStackParamList} from "../../App";

type NavigationProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

const ArtistListItem: React.FC<{ artist: Artist, isFavorite: boolean } & NavigationProps> =
    ({artist, isFavorite, navigation}) => {
        const styles = useArtistListItemStyles();

        return (<ListItem style={styles.listItem} onPress={() => {
            navigation.navigate('Years', {artistId: artist.id})
        }}>
            <ListItem.Part middle>
                <Text>{artist.name}</Text>
            </ListItem.Part>
            <ListItem.Part right>
                <TouchableOpacity onPress={() => {
                    LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
                    artist.setIsFavorite(!isFavorite);
                }}>
                    <Text>favorite: {isFavorite ? 'yes' : 'no'}</Text>
                </TouchableOpacity>
            </ListItem.Part>
        </ListItem>);
    };

const enhanceArtist = withObservables(['artist'], ({artist}) => ({
    artist,
    isFavorite: artist.isFavorite,
}));

export const EnhancedArtistListItem = enhanceArtist(ArtistListItem);

const useArtistListItemStyles = () => StyleSheet.create({
    listItem: {
        paddingHorizontal: 8,
        width: '100%'
    }
});

const ArtistsList: React.FC<{ artists: Favorited<Artist>[] } & NavigationProps> = ({artists, navigation, route}) => {
    const sectionedArtists = useMemo(() => {
        return [
            {title: 'Favorites', data: artists.filter(a => a.isFavorite)},
            {title: 'Featured', data: artists.filter(a => a.model.featured !== 0)},
            {title: `${artists.length + 1} Artists`, data: artists}
        ];
    }, [artists]);

    return <SectionList
        sections={sectionedArtists}
        keyExtractor={artist => artist.model.id}
        renderSectionHeader={({section: {title}}) => {
            return <Text>{title}</Text>;
        }}
        renderItem={({item: artist}) => {
            return <EnhancedArtistListItem
                artist={artist.model}
                navigation={navigation}
                route={route}
            />;
        }}
    />;
};

const enhanceArtists = withObservables(['artists'], ({artists}: { artists: Observable<Artist[] | undefined> }) => ({
    artists: asFavorited(database, artists)
}));

export const EnhancedArtistsList = enhanceArtists(ArtistsList);

export const HomeScreen: React.FC<PropsWithChildren<{} & NavigationProps>>
    = ({route, navigation}) => {
    const {isLoading, error, data: artists, dataSource} = useAllArtistsQuery();

    if (isLoading || !artists) {
        return <Text>Loading...</Text>;
    }

    return <View useSafeArea flex style={{width: '100%'}}>
        <EnhancedArtistsList
            artists={artists}
            navigation={navigation}
            route={route}
        />
    </View>;
};
