import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Show } from '@/relisten/realm/models/show';
import {
  useArtistRecentPerformedShows,
  useArtistRecentUpdatedShows,
} from '@/relisten/realm/models/show_repo';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { ScrollViewProps } from 'react-native';

enum Tabs {
  PERFORMED = 'performed',
  UPDATED = 'updated',
}

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
  const headerHeight = useHeaderHeight();
  const [activeTab, setActiveTab] = useState(Tabs.PERFORMED);
  const performedResults = useArtistRecentPerformedShows(String(artistUuid));
  const updatedResults = useArtistRecentUpdatedShows(String(artistUuid));

  useEffect(() => {
    navigation.setOptions({
      title: 'Recent Shows',
    });
  }, []);

  return activeTab === Tabs.PERFORMED ? (
    <RefreshContextProvider networkBackedResults={performedResults}>
      <DisappearingHeaderScreen
        headerHeight={headerHeight}
        ScrollableComponent={RecentList}
        shows={Array.from(performedResults.data.shows)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </RefreshContextProvider>
  ) : (
    <RefreshContextProvider networkBackedResults={updatedResults}>
      <DisappearingHeaderScreen
        headerHeight={headerHeight}
        ScrollableComponent={RecentList}
        shows={Array.from(updatedResults.data.shows)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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

interface RecentHeaderProps {
  activeTab: Tabs;
  setActiveTab: React.Dispatch<React.SetStateAction<Tabs>>;
}

const RecentHeader = ({ activeTab, setActiveTab }: RecentHeaderProps) => {
  return (
    <>
      <RelistenText
        className="w-full py-2 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        Recent Shows
      </RelistenText>
      <Flex full>
        <RelistenButton
          disabled={activeTab === Tabs.PERFORMED}
          cn="flex-1 rounded-none border-white"
          onPress={() => setActiveTab(Tabs.PERFORMED)}
        >
          Played
        </RelistenButton>
        <RelistenButton
          disabled={activeTab === Tabs.UPDATED}
          cn="flex-1 rounded-none border-white"
          onPress={() => setActiveTab(Tabs.UPDATED)}
        >
          Updated
        </RelistenButton>
      </Flex>
    </>
  );
};

interface RecentListProps
  extends Partial<Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle'>> {
  shows: Show[];
  activeTab: Tabs;
  setActiveTab: React.Dispatch<React.SetStateAction<Tabs>>;
}

const RecentList = ({ shows, activeTab, setActiveTab, ...props }: RecentListProps) => {
  return (
    <RelistenFlatList
      ListHeaderComponent={<RecentHeader activeTab={activeTab} setActiveTab={setActiveTab} />}
      data={shows}
      renderItem={({ item }: { item: Show; index: number }) => <RecentListItem recent={item} />}
      {...props}
    />
  );
};
