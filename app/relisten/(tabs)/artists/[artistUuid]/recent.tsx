import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { RelistenButton } from '@/relisten/components/relisten_button';
import {
  RecentShowTabs,
  useArtistRecentShows,
} from '@/relisten/realm/models/shows/recent_shows_repo';
import { ShowList, ShowListItem } from '@/relisten/components/shows_list';
import { clsx } from 'clsx';
import { ListRenderItem } from '@shopify/flash-list';
import { Show } from '@/relisten/realm/models/show';
import dayjs from 'dayjs';
import { SubtitleText } from '@/relisten/components/row_subtitle';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams<{ artistUuid: string }>();
  const [activeTab, setActiveTab] = useState(RecentShowTabs.Performed);
  const results = useArtistRecentShows(artistUuid, activeTab);

  useEffect(() => {
    navigation.setOptions({
      title: 'Recent Shows',
    });
  }, []);

  const showListRenderItem: ListRenderItem<Show> = ({ item: show }) => {
    return (
      <ShowListItem show={show}>
        {activeTab === RecentShowTabs.Updated && (
          <>
            <SubtitleText>Updated {dayjs(show.updatedAt).format('LLL')}</SubtitleText>
          </>
        )}
      </ShowListItem>
    );
  };

  // The API will only return the 25 latest shows so stop it here otherwise it'll just show the 26th latest show of
  // whatever is cached
  const shows = useMemo(() => {
    return results.data.shows.slice(0, 25);
  }, [results.data.shows]);

  console.log('RecentPage', 'activeTab', activeTab, 'setActiveTab', setActiveTab);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={ShowList}
        ListHeaderComponent={<RecentHeader activeTab={activeTab} setActiveTab={setActiveTab} />}
        shows={shows}
        artist={results.data.artist}
        renderItem={showListRenderItem}
        // filtering is provided by realm/the API response
        filtering={false}
      />
    </RefreshContextProvider>
  );
}

interface RecentHeaderProps {
  activeTab: RecentShowTabs;
  setActiveTab: React.Dispatch<React.SetStateAction<RecentShowTabs>>;
}

const RecentHeader = ({ activeTab, setActiveTab }: RecentHeaderProps) => {
  console.log('RecentHeader', 'activeTab', activeTab, 'setActiveTab', setActiveTab);
  console.log(
    'RecentHeader',
    'Performed',
    clsx('flex-1 rounded-none rounded-l-md', {
      'bg-relisten-blue-600': activeTab === RecentShowTabs.Performed,
    })
  );
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
          cn={clsx('flex-1 rounded-none rounded-l-md', {
            'bg-relisten-blue-600': activeTab === RecentShowTabs.Performed,
          })}
          onPress={() => setActiveTab(RecentShowTabs.Performed)}
        >
          Performed
        </RelistenButton>
        <RelistenButton
          cn={clsx('flex-1 rounded-none rounded-r-md', {
            'bg-relisten-blue-600': activeTab === RecentShowTabs.Updated,
          })}
          onPress={() => setActiveTab(RecentShowTabs.Updated)}
        >
          Updated
        </RelistenButton>
      </Flex>
    </>
  );
};
