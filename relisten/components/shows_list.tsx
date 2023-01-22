import React, { useMemo } from 'react';
import Show from '../db/models/show';
import { ListItem, Text, TouchableOpacity, View } from 'react-native-ui-lib';
import { LayoutAnimation, SectionList, StyleSheet } from 'react-native';
import { DefaultLayoutAnimationConfig } from '../layout_animation_config';
import { database, Favorited } from '../db/database';
import withObservables from '@nozbe/with-observables';
import { Observable } from 'rxjs';
import { asFavorited } from '../db/models/favorites';
import { SectionedListItem } from './sectioned_list_item';
import { SectionHeader } from './section_header';
import { FavoriteIconButton } from './favorite_icon_button';

const ShowListItem: React.FC<{ show: Show; isFavorite: boolean; onPress?: (show: Show) => {} }> = ({
  show,
  isFavorite,
  onPress,
}) => {
  return (
    <SectionedListItem onPress={() => onPress && onPress(show)}>
      <ListItem.Part middle>
        <View style={{ flexDirection: 'column' }}>
          <Text>{show.displayDate}</Text>
          <Text>Sources {show.sourceCount}</Text>
          <Text>Rating {Math.round(show.avgRating)}</Text>
          <Text>Duration {Math.round(show.avgDuration! / 60 / 60)} hours</Text>
        </View>
      </ListItem.Part>
      <ListItem.Part right>
        <FavoriteIconButton
          isFavorited={isFavorite}
          onPress={() => {
            LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
            show.setIsFavorite(!isFavorite);
          }}
        ></FavoriteIconButton>
      </ListItem.Part>
    </SectionedListItem>
  );
};

const enhanceShow = withObservables(['show'], ({ show }: { show: Show }) => ({
  show,
  isFavorite: show.isFavorite,
}));

const EnhancedShowListItem = enhanceShow(ShowListItem);

export const ShowList: React.FC<{
  shows: Favorited<Show>[];
  onItemPress?: (show: Show) => void;
}> = ({ shows, onItemPress }) => {
  const sectionedShow = useMemo(() => {
    return [
      { title: 'Favorites', data: shows.filter((a) => a.isFavorite) },
      { title: `${shows.length} Shows`, data: shows },
    ];
  }, [shows]);

  return (
    <SectionList
      sections={sectionedShow}
      keyExtractor={(show) => show.model.id}
      renderSectionHeader={({ section: { title } }) => {
        return <SectionHeader title={title} />;
      }}
      renderItem={({ item: show }) => {
        return <EnhancedShowListItem show={show.model} onPress={onItemPress} />;
      }}
    />
  );
};

const enhanceShows = withObservables(
  ['shows'],
  ({ shows }: { shows: Observable<Show[] | undefined> }) => ({
    shows: asFavorited(database, shows),
  })
);
export const EnhancedShowsList = enhanceShows(ShowList);
