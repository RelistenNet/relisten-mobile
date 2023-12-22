import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@/relisten/realm/schema';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { RelistenText } from '@/relisten/components/relisten_text';
import RowTitle from '@/relisten/components/row_title';
import { SubtitleText } from '@/relisten/components/row_subtitle';
import Plur from '@/relisten/components/plur';
import { Realm } from '@realm/react';
import * as Progress from 'react-native-progress';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { tw } from '@/relisten/util/tw';
import React, { useState } from 'react';
import Flex from '@/relisten/components/flex';

function DownloadListItem({ item }: { item: SourceTrackOfflineInfo }) {
  const sourceTrack = item.sourceTrack;

  return (
    <View className="w-full flex-1 flex-col px-4 py-4">
      <RowTitle>{sourceTrack.title}</RowTitle>
      <SubtitleText>
        {item.status} {item.queuedAt.toString()}
      </SubtitleText>
      <Progress.Bar progress={item.percent} className="w-100 flex-1" />
    </View>
  );
}

export enum MyLibraryTabs {
  Offline = 'offline',
  Library = 'library',
  Downloads = 'downloads',
}

export default function Page() {
  const [activeTab, setActiveTab] = useState(MyLibraryTabs.Offline);
  const downloads = useQuery(SourceTrackOfflineInfo, (query) =>
    query.filtered('status != $0', SourceTrackOfflineInfoStatus.Succeeded).sorted('queuedAt')
  );

  return (
    <SafeAreaView className="w-full flex-1">
      <FlatList
        ListHeaderComponent={
          <OfflineHeader downloads={downloads} activeTab={activeTab} setActiveTab={setActiveTab} />
        }
        className="w-full flex-1"
        data={downloads}
        renderItem={({ item }) => {
          return <DownloadListItem item={item} />;
        }}
      />
    </SafeAreaView>
  );
}

const OfflineHeader = ({
  downloads,
  activeTab,
  setActiveTab,
}: {
  downloads: Realm.Results<SourceTrackOfflineInfo>;
  activeTab: MyLibraryTabs;
  setActiveTab: React.Dispatch<React.SetStateAction<MyLibraryTabs>>;
}) => {
  return (
    <>
      <RelistenText
        className="w-full py-2 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        Offline
      </RelistenText>
      <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
        <Plur word="Download" count={downloads.length} />
      </RelistenText>

      <Flex cn="m-2 rounded-sm">
        {Object.values(MyLibraryTabs).map((tab) => (
          <RelistenButton
            key={tab}
            cn={tw('flex-1 ', {
              'bg-relisten-blue-600': activeTab === tab,
            })}
            onPress={() => setActiveTab(tab)}
          >
            {tab}
          </RelistenButton>
        ))}
      </Flex>
    </>
  );
};
