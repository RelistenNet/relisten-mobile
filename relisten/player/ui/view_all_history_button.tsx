import { RelistenText } from '@/relisten/components/relisten_text';
import { PlayerPanelRow } from '@/relisten/player/ui/player_panel_row';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

export function ViewAllHistoryButton({
  isLast,
  onPress,
}: {
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <PlayerPanelRow isFirst isLast={isLast}>
      <Pressable
        accessibilityHint="Opens your complete listening history."
        accessibilityLabel="View All Listening History"
        accessibilityRole="button"
        className="min-h-12 flex-row items-center gap-3 px-4 py-3 active:opacity-70"
        onPress={onPress}
      >
        <View className="h-8 w-8 items-center justify-center rounded-full bg-relisten-blue-700/60">
          <MaterialIcons color="rgba(147, 224, 242, 0.92)" name="history" size={20} />
        </View>
        <RelistenText className="flex-1 font-semibold" selectable={false}>
          View All Listening History
        </RelistenText>
        <MaterialIcons color="rgba(255, 255, 255, 0.62)" name="chevron-right" size={24} />
      </Pressable>
    </PlayerPanelRow>
  );
}
