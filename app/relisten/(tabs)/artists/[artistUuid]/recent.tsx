import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Show } from '@/relisten/realm/models/show';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenFlatList } from '@/relisten/components/relisten_flat_list';
import { ScrollViewProps } from 'react-native';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useArtistRecentShows } from '@/relisten/realm/models/shows/recent_shows_repo';

enum Tabs {
  PERFORMED = 'performed',
  UPDATED = 'updated',
}

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
  const headerHeight = useHeaderHeight();
  const [activeTab, setActiveTab] = useState(Tabs.PERFORMED);
  const results = useArtistRecentShows(String(artistUuid), activeTab);

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
        shows={Array.from(results.data.shows)}
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
      <Flex cn="m-2 rounded-sm">
        <RelistenButton
          cn="flex-1 rounded-none rounded-l-md"
          style={{
            backgroundColor: `${
              activeTab === Tabs.UPDATED ? RelistenBlue[800] : RelistenBlue[600]
            }`,
          }}
          onPress={() => setActiveTab(Tabs.PERFORMED)}
        >
          Performed
        </RelistenButton>
        <RelistenButton
          style={{
            backgroundColor: `${
              activeTab === Tabs.PERFORMED ? RelistenBlue[800] : RelistenBlue[600]
            }`,
          }}
          cn="flex-1 rounded-none rounded-r-md"
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
