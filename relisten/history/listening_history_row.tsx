import { OverflowMenuTrigger } from '@/relisten/components/menus/overflow_menu_trigger';
import { RelistenText } from '@/relisten/components/relisten_text';
import { HistoryEntryContent } from '@/relisten/history/history_entry_content';
import { HistoryTrackActionsMenu } from '@/relisten/history/history_track_actions_menu';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { Pressable, View } from 'react-native';

type ListeningHistoryRowProps = {
  entry: PlaybackHistoryEntry;
  onViewShow: (entry: PlaybackHistoryEntry) => void;
};

export function ListeningHistoryRow({ entry, onViewShow }: ListeningHistoryRowProps) {
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

  return (
    <View className="flex-row items-center pl-5 pr-2">
      <Pressable
        accessibilityHint="Opens the show containing this track."
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className="min-w-0 flex-1"
        onPress={viewShow}
        style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
      >
        <HistoryEntryContent
          sourceTrack={sourceTrack}
          trailing={
            <RelistenText className="text-sm text-gray-300" selectable={false}>
              {entry.humanizedPlaybackStartedAt()}
            </RelistenText>
          }
        />
      </Pressable>
      <View className="ml-1">
        <HistoryTrackActionsMenu onViewShow={viewShow} sourceTrack={sourceTrack}>
          <OverflowMenuTrigger accessibilityLabel={`Actions for ${sourceTrack.title}`} />
        </HistoryTrackActionsMenu>
      </View>
    </View>
  );
}
