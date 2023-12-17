import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Show } from '@/relisten/realm/models/show';
import { useArtistRecentShows } from '@/relisten/realm/models/show_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { ScrollViewProps } from 'react-native';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistRecentShows(String(artistUuid));
  const { data } = results;
  const headerHeight = useHeaderHeight();

  useEffect(() => {
    navigation.setOptions({
      title: 'Recent Shows',
    });
  }, []);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        headerHeight={headerHeight}
        ScrollableComponent={RecentList}
        shows={Array.from(data.shows)}
      />
    </RefreshContextProvider>
  );
}

interface RecentListItemProps {
  recent: Show;
}

const RecentListItem = ({ recent }: RecentListItemProps) => {
  return (
    <SectionedListItem>
      <Flex column>
        <RowTitle>{recent.displayDate}</RowTitle>
        <SubtitleRow>
          <SubtitleText>{recent.venue?.name}</SubtitleText>
        </SubtitleRow>
      </Flex>
    </SectionedListItem>
  );
};

const RecentHeader = () => {
  return (
    <>
      <RelistenText
        className="w-full py-2 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        Recent Shows
      </RelistenText>
      <Flex full>
        <RelistenButton cn="flex-1 rounded-none border-white">Played</RelistenButton>
        <RelistenButton cn="flex-1 rounded-none border-white">Updated</RelistenButton>
      </Flex>
    </>
  );
};

interface RecentListProps
  extends Partial<Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle'>> {
  shows: Show[];
}

const RecentList = ({ shows, ...props }: RecentListProps) => {
  return (
    <RelistenFlatList
      ListHeaderComponent={<RecentHeader />}
      data={shows}
      renderItem={({ item }: { item: Show; index: number }) => <RecentListItem recent={item} />}
      {...props}
    />
  );
};
