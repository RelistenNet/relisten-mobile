import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import Plur from '@/relisten/components/plur';
import { RelistenText } from '@/relisten/components/relisten_text';
import { confirmClearListeningHistory } from '@/relisten/history/confirm_clear_listening_history';
import { ListeningHistoryList } from '@/relisten/history/listening_history_list';
import { usePagedListeningHistory } from '@/relisten/history/use_paged_listening_history';
import {
  PLAYER_PANEL_BACKGROUND,
  PLAYER_PANEL_DIVIDER_COLOR,
  PLAYER_PANEL_HORIZONTAL_PADDING,
  PLAYER_PANEL_ROW_BACKGROUND,
} from '@/relisten/player/ui/player_panel_theme';
import { usePlayerListDismissal } from '@/relisten/player/ui/use_player_list_dismissal';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { useRealm } from '@/relisten/realm/schema';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { useWindowDimensions, View } from 'react-native';
import { useAnimatedScrollHandler } from 'react-native-reanimated';

const CLEAR_ACTION_ID = 'clear-history';
const CLEAR_ACTIONS: MenuAction[] = [
  {
    attributes: { destructive: true },
    id: CLEAR_ACTION_ID,
    image: nativeMenuIcons.clearHistory,
    title: 'Clear Listening History…',
  },
];

function PlayerHistorySummary({
  onClear,
  totalCount,
}: {
  onClear: () => void;
  totalCount: number;
}) {
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: PLAYER_PANEL_ROW_BACKGROUND,
        borderBottomColor: PLAYER_PANEL_DIVIDER_COLOR,
        borderBottomWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: 60 * controlScale,
        paddingLeft: PLAYER_PANEL_HORIZONTAL_PADDING,
        paddingRight: 4,
        paddingVertical: 8 * controlScale,
      }}
    >
      <RelistenText className="text-gray-300" selectable={false}>
        <Plur count={totalCount} word="track" /> played
      </RelistenText>
      <NativeMenuView
        actions={CLEAR_ACTIONS}
        onPressAction={({ nativeEvent }) => {
          if (nativeEvent.event === CLEAR_ACTION_ID) onClear();
        }}
      >
        <OverflowMenuTrigger accessibilityLabel="Listening history actions" />
      </NativeMenuView>
    </View>
  );
}

function PlayerHistorySectionHeader({ title }: { title: string }) {
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);

  return (
    <View
      accessibilityRole="header"
      style={{
        backgroundColor: PLAYER_PANEL_BACKGROUND,
        borderBottomColor: PLAYER_PANEL_DIVIDER_COLOR,
        borderBottomWidth: 1,
        minHeight: 46 * controlScale,
        paddingHorizontal: PLAYER_PANEL_HORIZONTAL_PADDING,
        paddingVertical: 10 * controlScale,
      }}
    >
      <RelistenText className="text-sm font-semibold text-relisten-blue-100/90" selectable={false}>
        {title}
      </RelistenText>
    </View>
  );
}

export function PlayerHistoryView({
  allowsInteractiveDismiss,
  onViewShow,
}: {
  allowsInteractiveDismiss: boolean;
  onViewShow: (entry: PlaybackHistoryEntry) => void;
}) {
  const realm = useRealm();
  const history = usePagedListeningHistory();
  const listDismissal = usePlayerListDismissal(allowsInteractiveDismiss);
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      listDismissal.updateDismissalProgress(event.contentOffset.y);
    },
  });

  return (
    <ListeningHistoryList
      alwaysBounceVertical
      ListEmptyComponent={
        <View style={{ alignItems: 'center', padding: 32 }}>
          <RelistenText className="text-center text-gray-300" selectable={false}>
            No listening history yet
          </RelistenText>
        </View>
      }
      ListHeaderComponent={
        <PlayerHistorySummary
          onClear={() => confirmClearListeningHistory(realm)}
          totalCount={history.totalCount}
        />
      }
      contentContainerStyle={{
        backgroundColor: PLAYER_PANEL_ROW_BACKGROUND,
        paddingBottom: 24,
      }}
      contentInsetAdjustmentBehavior="never"
      history={history}
      onScroll={handleScroll}
      onScrollBeginDrag={listDismissal.onScrollBeginDrag}
      onScrollEndDrag={listDismissal.onScrollEndDrag}
      onViewShow={onViewShow}
      renderSectionHeader={(section) => <PlayerHistorySectionHeader title={section.sectionTitle} />}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      style={{ backgroundColor: PLAYER_PANEL_ROW_BACKGROUND, flex: 1 }}
    />
  );
}
