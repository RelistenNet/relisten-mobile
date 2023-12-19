import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useArtistRecentShows } from '@/relisten/realm/models/shows/recent_shows_repo';
import { ShowFilterKey, ShowList } from '@/relisten/components/shows_list';
import { SortDirection } from '@/relisten/components/filtering/filters';

enum Tabs {
  PERFORMED = 'performed',
  UPDATED = 'updated',
}

const recentFilterOptions = {
  default: {
    persistenceKey: ShowFilterKey.Date,
    active: true,
    sortDirection: SortDirection.Descending,
  },
};

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
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
        ScrollableComponent={ShowList}
        shows={results.data.shows}
        artist={results.data.artist}
        filterOptions={recentFilterOptions}
        hideFilterBar={false}
      >
        <RecentHeader activeTab={activeTab} setActiveTab={setActiveTab} />
      </DisappearingHeaderScreen>
    </RefreshContextProvider>
  );
}

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
