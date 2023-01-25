import withObservables from '@nozbe/with-observables';
import React, { useMemo } from 'react';
import { LayoutAnimation, SectionList } from 'react-native';
import { Observable } from 'rxjs';
import { database, Favorited } from '../db/database';
import { asFavorited } from '../db/models/favorites';
import Show from '../db/models/show';
import { DefaultLayoutAnimationConfig } from '../layout_animation_config';
import { FavoriteIconButton } from './favorite_icon_button';
import Flex from './flex';
import RowSubtitle from './row_subtitle';
import RowTitle from './row_title';
import { SectionedListItem } from './sectioned_list_item';
import { SectionHeader } from './section_header';

const ShowListItem: React.FC<{ show: Show; isFavorite: boolean; onPress?: (show: Show) => {} }> = ({
  show,
  isFavorite,
  onPress,
}) => {
  return (
    <SectionedListItem onPress={() => onPress && onPress(show)}>
      <Flex className="justify-between flex-1">
        <Flex className="flex-1" column>
          <RowTitle>{show.displayDate}</RowTitle>
          <RowSubtitle>Venue Goes Here</RowSubtitle>
          <Flex className="justify-between flex-1">
            <RowSubtitle>
              {show.sourceCount} tape(s) &middot; {show.avgRating.toFixed(1)} ★ &middot;{' '}
              {Number(show.avgDuration! / 60 / 60).toFixed(2)} hours
            </RowSubtitle>
          </Flex>
        </Flex>
      </Flex>
      <FavoriteIconButton
        isFavorited={isFavorite}
        onPress={() => {
          LayoutAnimation.configureNext(DefaultLayoutAnimationConfig);
          show.setIsFavorite(!isFavorite);
        }}
      ></FavoriteIconButton>
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
