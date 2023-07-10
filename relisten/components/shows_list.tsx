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
import { RelistenText } from './relisten_text';

const ShowListItem: React.FC<{ show: Show; onPress?: (show: Show) => void }> = memo(
  ({ show, onPress }) => {
    return (
      <SectionedListItem onPress={() => onPress && onPress(show)}>
        <Flex className="flex justify-between" full>
          <Flex className="flex-1 pr-2" column>
            <Flex className="items-center" style={{ gap: 8 }}>
              <RowTitle>{show.displayDate}</RowTitle>
              {show.hasSoundboardSource && (
                <RelistenText className="text-xs font-bold text-relisten-blue-600">
                  SBD
                </RelistenText>
              )}
            </Flex>
            {show.venue && (
              <RowSubtitle className="pt-1" numberOfLines={1}>
                {show.venue.name}, {show.venue.location}
              </RowSubtitle>
            )}
            <Flex className="flex-1 justify-between pt-1">
              <RowSubtitle>
                {show.sourceCount} tape(s) &middot; {show.humanizedAvgRating()} ★ &middot;{' '}
                {show.humanizedAvgDuration()}
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
