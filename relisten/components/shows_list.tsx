import Realm from 'realm';
import React, { useMemo } from 'react';
import { Show } from '../realm/models/show';
import { SectionedListItem } from './sectioned_list_item';
import { FavoriteObjectButton } from './favorite_icon_button';
import { RelistenSectionList } from './relisten_section_list';
import { memo } from '../util/memo';
import RowSubtitle from './row_subtitle';
import Flex from './flex';
import RowTitle from './row_title';

const ShowListItem: React.FC<{ show: Show; onPress?: (show: Show) => void }> = memo(
  ({ show, onPress }) => {
    return (
      <SectionedListItem onPress={() => onPress && onPress(show)}>
        <Flex className="flex-1 justify-between" full>
          <Flex className="flex-1" column>
            <RowTitle>{show.displayDate}</RowTitle>
            <RowSubtitle>Venue Goes Here</RowSubtitle>
            <Flex className="flex-1 justify-between">
              <RowSubtitle>
                {show.sourceCount} tape(s) &middot; {show.avgRating.toFixed(1)} ★ &middot;{' '}
                {Number(show.avgDuration! / 60 / 60).toFixed(2)} hours
              </RowSubtitle>
            </Flex>
          </Flex>
          <FavoriteObjectButton object={show} />
        </Flex>
      </SectionedListItem>
    );
  }
);

export const ShowList: React.FC<{
  shows: Realm.Results<Show>;
  onItemPress?: (show: Show) => void;
}> = ({ shows, onItemPress }) => {
  const sectionedShow = useMemo(() => {
    const all = [...shows];
    return [
      { title: 'Favorites', data: all.filter((a) => a.isFavorite) },
      { title: `${shows.length} Shows`, data: all },
    ];
  }, [shows]);

  return (
    <RelistenSectionList
      sections={sectionedShow}
      renderItem={({ item: show }) => {
        return <ShowListItem show={show} onPress={onItemPress} />;
      }}
    />
  );
};
