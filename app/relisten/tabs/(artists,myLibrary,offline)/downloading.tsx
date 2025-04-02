import { useQuery } from '@/relisten/realm/schema';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { Realm } from '@realm/react';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleText } from '@/relisten/components/row_subtitle';
import { useNavigation } from 'expo-router';
import React, { useEffect } from 'react';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import dayjs from 'dayjs';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { TrackWithArtist } from '@/relisten/components/source/source_track_with_artist';
import { RelistenSectionList } from '@/relisten/components/relisten_section_list';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { View } from 'react-native';
import { DownloadManager } from '@/relisten/offline/download_manager';

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
      ScrollableComponent={
        RelistenSectionList as typeof RelistenSectionList<SourceTrackOfflineInfo>
      }
      ListHeaderComponent={<OfflineHeader downloads={downloads} />}
      data={[{ data: downloads as unknown as ReadonlyArray<SourceTrackOfflineInfo> }]}
      renderItem={({ item }) => {
        return <DownloadListItem item={item} />;
      }}
    />
  );
}

const DownloadListItem = ({ item }: { item: SourceTrackOfflineInfo }) => {
  const sourceTrack = item.sourceTrack;

  return (
    <TrackWithArtist
      sourceTrack={sourceTrack}
      offlineIndicator={false}
      subtitleColumn={true}
      indicatorComponent={<SourceTrackOfflineIndicator offlineInfo={item} />}
    >
      <DownloadStatusTime item={item} />
    </TrackWithArtist>
  );
};

const DownloadStatusTime = ({ item }: { item: SourceTrackOfflineInfo }) => {
  if (item.status === SourceTrackOfflineInfoStatus.Succeeded) {
    return (
      <SubtitleText cn="italic text-xs">
        Downloaded {dayjs(item.completedAt).fromNow()}
      </SubtitleText>
    );
  }

  return <SubtitleText>Queued {dayjs(item.queuedAt).fromNow()}</SubtitleText>;
};

const OfflineHeader = ({ downloads }: { downloads: Realm.Results<SourceTrackOfflineInfo> }) => {
  const cancelDownloads = async () => {
    await DownloadManager.SHARED_INSTANCE.removeAllPendingDownloads();
  };

  const retryDownloads = async () => {
    await DownloadManager.SHARED_INSTANCE.retryFailedDownloads();
  };

  return (
    <>
      <RelistenText
        className="w-full pb-2 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        Downloading
      </RelistenText>
      <RelistenText className="text-l w-full pb-4 text-center italic text-gray-400">
        {downloads.length} downloading
      </RelistenText>
      <View className="w-full flex-row justify-center px-4 pb-4" style={{ gap: 16 }}>
        <RelistenButton
          className="shrink basis-1/2"
          textClassName="text-l"
          onPress={cancelDownloads}
        >
          Cancel Downloads
        </RelistenButton>
        <RelistenButton
          className="shrink basis-1/2"
          textClassName="text-l"
          onPress={retryDownloads}
        >
          Retry Failed
        </RelistenButton>
      </View>
    </>
  );
};
