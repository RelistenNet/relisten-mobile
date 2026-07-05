import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { confirmClearListeningHistory } from '@/relisten/history/confirm_clear_listening_history';
import { ListeningHistoryList } from '@/relisten/history/listening_history_list';
import { usePagedListeningHistory } from '@/relisten/history/use_paged_listening_history';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { useRealm } from '@/relisten/realm/schema';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { Stack } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

function HistoryHeader({ totalPlayed }: { totalPlayed: number }) {
  return (
    <View className="flex w-full flex-col items-center gap-1 py-2 pb-8">
      <RelistenText className="w-full text-center text-4xl font-bold text-white" selectable={false}>
        My History
      </RelistenText>
      <RelistenText className="text-l w-full text-center italic text-gray-400" selectable={false}>
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
  const history = usePagedListeningHistory();
  const { pushShow } = usePushShowRespectingUserSettings();
  const viewShow = useCallback(
    (entry: PlaybackHistoryEntry) => {
      pushShow({
        artist: entry.artist,
        showUuid: entry.show.uuid,
        sourceUuid: entry.source.uuid,
      });
    },
    [pushShow]
  );

  return (
    <>
      <HistoryToolbar
        disabled={history.totalCount === 0}
        onClear={() => confirmClearListeningHistory(realm)}
      />
      <RefreshContextProvider>
        <DisappearingHeaderScreen
          ScrollableComponent={ListeningHistoryList}
          ListHeaderComponent={<HistoryHeader totalPlayed={history.totalCount} />}
          history={history}
          onViewShow={viewShow}
          pullToRefresh
        />
      </RefreshContextProvider>
    </>
  );
}
