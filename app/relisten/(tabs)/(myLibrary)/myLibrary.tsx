import Plur from '@/relisten/components/plur';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { useQuery } from '@/relisten/realm/schema';
import { Realm } from '@realm/react';
import { FlatList, View } from 'react-native';
import * as Progress from 'react-native-progress';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export default function Page() {
  const downloads = useQuery(SourceTrackOfflineInfo, (query) =>
    query.filtered('status != $0', SourceTrackOfflineInfoStatus.Succeeded).sorted('queuedAt')
  );

  return (
    <SafeAreaView className="w-full flex-1">
      <FlatList
        ListHeaderComponent={<OfflineHeader downloads={downloads} />}
        className="w-full flex-1"
        data={downloads}
        renderItem={({ item }) => {
          return <DownloadListItem item={item} />;
        }}
      />
    </SafeAreaView>
  );
}

const OfflineHeader = ({ downloads }: { downloads: Realm.Results<SourceTrackOfflineInfo> }) => {
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
    </>
  );
};
