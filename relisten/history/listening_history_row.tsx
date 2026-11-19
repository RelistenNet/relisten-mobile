import { TrackDuration } from '@/relisten/components/track_duration';
import { Ionicons } from '@expo/vector-icons';
import { type HistorySelection } from '@/relisten/history/history_selection';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { HistoryEntryContent } from '@/relisten/history/history_entry_content';
import { HistoryTrackActionsMenu } from '@/relisten/history/history_track_actions_menu';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { Pressable, View } from 'react-native';

type ListeningHistoryRowProps = {
  entry: PlaybackHistoryEntry;
  onViewShow: (entry: PlaybackHistoryEntry) => void;
  /** Present while selecting entries. */
  selection?: HistorySelection;
  onStartSelection?: (entryUuid: string) => void;
};

export function ListeningHistoryRow({
  entry,
  onViewShow,
  selection,
  onStartSelection,
}: ListeningHistoryRowProps) {
  const sourceTrack = entry.sourceTrack;
  const venue = sourceTrack.show.venue;
  const viewShow = () => onViewShow(entry);
  const accessibilityLabel = [
    `View show for ${sourceTrack.title}`,
    sourceTrack.artist.name,
    sourceTrack.show.displayDate,
    venue?.name,
    venue?.location,
    `played at ${entry.playbackStartedAt.toLocaleString()}`,
  ]
    .filter(Boolean)
    .join(', ');

  if (selection) {
    const checked = selection.selected.has(entry.uuid);
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel.replace(`View show for `, '')}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        className="flex-row items-center pl-5 pr-2"
        onPress={() => selection.toggle(entry.uuid)}
      >
        <View className="min-w-0 flex-1">
          <HistoryEntryContent sourceTrack={sourceTrack} />
        </View>
        <View className="h-11 w-11 items-center justify-center">
          <Ionicons
            name={checked ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={checked ? RelistenBlue[400] : 'rgba(255,255,255,0.5)'}
          />
        </View>
      </Pressable>
    );
  }

  const startSelection = onStartSelection && (() => onStartSelection(entry.uuid));
  return (
    <View className="flex-row items-center pl-5 pr-2">
      <Pressable
        accessibilityHint="Opens the show containing this track."
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className="min-w-0 flex-1"
        onPress={viewShow}
        onLongPress={startSelection}
        style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
      >
        <HistoryEntryContent
          sourceTrack={sourceTrack}
          trailing={
            <TrackDuration duration={entry.humanizedPlaybackStartedAt()} small widest="00:00 AM" />
          }
        />
      </Pressable>
      <View className="ml-1">
        <HistoryTrackActionsMenu
          onViewShow={viewShow}
          onSelect={startSelection}
          sourceTrack={sourceTrack}
        >
          <OverflowMenuTrigger accessibilityLabel={`Actions for ${sourceTrack.title}`} />
        </HistoryTrackActionsMenu>
      </View>
    </View>
  );
}
