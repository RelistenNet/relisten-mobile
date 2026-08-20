import { useQuery, useRealm } from '@/relisten/realm/schema';
import { confirmDestructiveAction } from '@/relisten/components/menus/confirm_destructive_action';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { useMemo } from 'react';
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
import { SubtitleText } from '@/relisten/components/row_subtitle';
import { ListRenderItem } from '@shopify/flash-list';
import { TrackWithArtist } from '@/relisten/components/source/source_track_with_artist';
import { Stack } from 'expo-router';
import {
  ACTIVE_PLAYBACK_HISTORY_QUERY,
  readRetainedPlaybackHistoryCatalogLinks,
  softDeletePlaybackHistoryEntries,
} from '@/relisten/realm/models/history/playback_history_lifecycle';

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

function HistoryToolbar({ disabled, onClear }: { disabled: boolean; onClear: () => void }) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu
        accessibilityLabel="Listening history actions"
        disabled={disabled}
        icon={nativeMenuIcons.more}
      >
        <Stack.Toolbar.MenuAction
          destructive
          disabled={disabled}
          icon={nativeMenuIcons.clearHistory}
          onPress={onClear}
        >
          Clear Listening History…
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}

export default function Page() {
  const realm = useRealm();
  const recentlyPlayed = useQuery(
    {
      type: PlaybackHistoryEntry,
      query: (query) =>
        query
          .filtered(ACTIVE_PLAYBACK_HISTORY_QUERY)
          .sorted('playbackStartedAt', /* reverse= */ true),
    },
    []
  );

  const confirmClearHistory = () => {
    confirmDestructiveAction({
      confirmLabel: 'Clear History',
      message: 'This will permanently delete your listening history.',
      onConfirm: () => {
        softDeletePlaybackHistoryEntries(realm);
      },
      title: 'Clear Listening History?',
    });
  };

  // TODO: make it not just 300 but dynamically loading more
  const historyEntriesByDate: RelistenSectionData<PlaybackHistoryEntry> = useMemo(() => {
    const byDate = aggregateBy(recentlyPlayed.slice(0, 300), (e) =>
      dayjs(e.playbackStartedAt).format('LL')
    );

    return Object.keys(byDate).map((d) => {
      const totalDuration = byDate[d]
        .map(
          (entry) =>
            readRetainedPlaybackHistoryCatalogLinks(entry, 'history.screen.sectionDuration')
              .sourceTrack.duration || 0
        )
        .reduce((acc, curr) => acc + curr, 0);

      return {
        sectionTitle: `${d} · ${dayjs.duration(totalDuration, 'seconds').humanize()}`,
        data: byDate[d],
      };
    });
  }, [recentlyPlayed]);

  const renderItem: ListRenderItem<PlaybackHistoryEntry> = ({ item: entry }) => {
    const { sourceTrack } = readRetainedPlaybackHistoryCatalogLinks(
      entry,
      'history.screen.trackRow'
    );
    return (
      <TrackWithArtist sourceTrack={sourceTrack}>
        <SubtitleText>{entry.humanizedPlaybackStartedAt()}</SubtitleText>
      </TrackWithArtist>
    );
  };

  return (
    <>
      <HistoryToolbar disabled={recentlyPlayed.length === 0} onClear={confirmClearHistory} />
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
    </>
  );
}
