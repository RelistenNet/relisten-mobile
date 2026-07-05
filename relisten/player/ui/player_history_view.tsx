import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import Plur from '@/relisten/components/plur';
import { RelistenText } from '@/relisten/components/relisten_text';
import { confirmClearListeningHistory } from '@/relisten/history/confirm_clear_listening_history';
import { ListeningHistoryList } from '@/relisten/history/listening_history_list';
import { usePagedListeningHistory } from '@/relisten/history/use_paged_listening_history';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { useRealm } from '@/relisten/realm/schema';
import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function PlayerHistorySummary({ totalCount }: { totalCount: number }) {
  return (
    <View className="min-h-14 flex-row items-center border-b border-relisten-blue-500/15 bg-relisten-blue-950 px-5 py-3">
      <RelistenText className="text-gray-300" selectable={false}>
        <Plur count={totalCount} word="track" /> played
      </RelistenText>
    </View>
  );
}

function PlayerHistorySectionHeader({ title }: { title: string }) {
  return (
    <View
      accessibilityRole="header"
      className="min-h-11 justify-center border-b border-relisten-blue-500/15 bg-relisten-blue-900 px-5 py-2"
    >
      <RelistenText className="text-sm font-semibold text-relisten-blue-100/90" selectable={false}>
        {title}
      </RelistenText>
    </View>
  );
}

export function PlayerHistoryView({
  onViewShow,
}: {
  onViewShow: (entry: PlaybackHistoryEntry) => void;
}) {
  const realm = useRealm();
  const history = usePagedListeningHistory();
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Close Listening History"
          icon="xmark"
          onPress={() => router.back()}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          accessibilityLabel="Listening history actions"
          disabled={history.totalCount === 0}
          icon={nativeMenuIcons.more}
        >
          <Stack.Toolbar.MenuAction
            destructive
            disabled={history.totalCount === 0}
            icon={nativeMenuIcons.clearHistory}
            onPress={() => confirmClearListeningHistory(realm)}
          >
            Clear Listening History…
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <ListeningHistoryList
        adjustsForPlayerBottomBar={false}
        ListEmptyComponent={
          <View className="items-center p-8">
            <RelistenText className="text-center text-gray-300" selectable={false}>
              No listening history yet
            </RelistenText>
          </View>
        }
        ListHeaderComponent={<PlayerHistorySummary totalCount={history.totalCount} />}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
        contentInsetAdjustmentBehavior="automatic"
        history={history}
        onViewShow={onViewShow}
        renderSectionHeader={(section) => (
          <PlayerHistorySectionHeader title={section.sectionTitle} />
        )}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        className="flex-1 bg-relisten-blue-950"
      />
    </>
  );
}
