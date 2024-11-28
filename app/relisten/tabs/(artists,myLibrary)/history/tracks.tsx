import { useQuery } from '@/relisten/realm/schema';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import React, { useMemo } from 'react';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { aggregateBy } from '@/relisten/util/group_by';
import dayjs from 'dayjs';
import {
  RelistenSectionData,
  RelistenSectionList,
} from '@/relisten/components/relisten_section_list';
import { View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import { Link } from 'expo-router';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import Flex from '@/relisten/components/flex';
import RowTitle from '@/relisten/components/row_title';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import { useGroupSegment } from '@/relisten/util/routes';
import { ListRenderItem } from '@shopify/flash-list';
import { TrackWithArtist } from '@/relisten/components/source/source_track_with_artist';

function HistoryHeader({ totalPlayed }: { totalPlayed: number }) {
  return (
    <View className="flex w-full flex-col items-center gap-1 py-2 pb-8">
      <RelistenText className="w-full text-center text-4xl font-bold text-white" selectable={false}>
        My History
      </RelistenText>

      <RelistenText className="text-l w-full text-center italic text-gray-400">
        <Plur word="track" count={totalPlayed} />
        &nbsp;played
      </RelistenText>
    </View>
  );
}

export default function Page() {
  const groupSegment = useGroupSegment();
  const recentlyPlayed = useQuery(
    {
      type: PlaybackHistoryEntry,
      query: (query) => query.sorted('playbackStartedAt', /* reverse= */ true),
    },
    []
  );

  // TODO: make it not just 300 but dynamically loading more
  const historyEntriesByDate: RelistenSectionData<PlaybackHistoryEntry> = useMemo(() => {
    const byDate = aggregateBy(recentlyPlayed.slice(0, 300), (e) =>
      dayjs(e.playbackStartedAt).format('LL')
    );

    return Object.keys(byDate).map((d) => {
      const totalDuration = byDate[d]
        .map((d) => d.sourceTrack.duration || 0)
        .reduce((acc, curr) => acc + curr, 0);

      return {
        sectionTitle: d + `  ·  ${dayjs.duration(totalDuration, 'seconds').humanize()}`,
        data: byDate[d],
      };
    });
  }, [recentlyPlayed]);

  const renderItem: ListRenderItem<PlaybackHistoryEntry> = ({ item: entry }) => {
    return (
      <TrackWithArtist sourceTrack={entry.sourceTrack}>
        <SubtitleText>{entry.humanizedPlaybackStartedAt()}</SubtitleText>
      </TrackWithArtist>
    );
  };

  return (
    <RefreshContextProvider>
      <DisappearingHeaderScreen
        ScrollableComponent={
          RelistenSectionList as typeof RelistenSectionList<PlaybackHistoryEntry>
        }
        ListHeaderComponent={<HistoryHeader totalPlayed={recentlyPlayed.length} />}
        data={historyEntriesByDate}
        renderItem={renderItem}
      />
    </RefreshContextProvider>
  );
}
