import { useQuery } from '@/relisten/realm/schema';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { FlatList, View } from 'react-native';
import { Realm } from '@realm/react';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import RowTitle from '@/relisten/components/row_title';
import { SubtitleText } from '@/relisten/components/row_subtitle';
import { useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import dayjs from 'dayjs';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';

export default function Page() {
  const navigation = useNavigation();

  const downloads = useQuery(SourceTrackOfflineInfo, (query) =>
    query.filtered('status != $0', SourceTrackOfflineInfoStatus.Succeeded).sorted('queuedAt')
  );

  useEffect(() => {
    navigation.setOptions({ title: 'Downloading' });
  }, [navigation]);

  return (
    <DisappearingHeaderScreen
      ScrollableComponent={FlatList}
      ListHeaderComponent={<OfflineHeader downloads={downloads} />}
      className="w-full flex-1"
      data={downloads}
      renderItem={({ item }) => {
        return <DownloadListItem item={item} />;
      }}
    />
  );
}

const DownloadListItem = ({ item }: { item: SourceTrackOfflineInfo }) => {
  const sourceTrack = item.sourceTrack;

  return (
    <View className="w-full flex-1 flex-row items-center px-4 py-2">
      <View className="flex-1 flex-col">
        <RowTitle>{sourceTrack.title}</RowTitle>
        <SubtitleText>
          {sourceTrack.artist?.name} &bull; {sourceTrack.source?.displayDate}
        </SubtitleText>
        <DownloadStatusTime item={item} />
      </View>
      <SourceTrackOfflineIndicator offlineInfo={item} />
    </View>
  );
};

const DownloadStatusTime = ({ item }: { item: SourceTrackOfflineInfo }) => {
  if (item.status === SourceTrackOfflineInfoStatus.Succeeded) {
    return <SubtitleText>Downloaded {dayjs(item.completedAt).fromNow()}</SubtitleText>;
  }

  return <SubtitleText>Queued at {dayjs(item.queuedAt).fromNow()}</SubtitleText>;
};

const OfflineHeader = ({ downloads }: { downloads: Realm.Results<SourceTrackOfflineInfo> }) => {
  return (
    <>
      <RelistenText
        className="w-full py-2 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        Downloading
      </RelistenText>
      <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
        {downloads.length} downloading
      </RelistenText>
    </>
  );
};
