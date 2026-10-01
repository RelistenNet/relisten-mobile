import { RelistenText } from '@/relisten/components/relisten_text';
import { MaterialIcons } from '@expo/vector-icons';
import { TouchableOpacity, View } from 'react-native';

type PlayerTimelineSectionHeaderProps = {
  count?: number;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress?: () => void;
};

export function PlayerTimelineSectionHeader({
  count,
  icon,
  label,
  onPress,
}: PlayerTimelineSectionHeaderProps) {
  const accessibilityLabel =
    count === undefined ? label : `${label}, ${count} ${count === 1 ? 'track' : 'tracks'}`;

  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? 'button' : 'header'}
      accessibilityHint={onPress ? 'Opens the queue.' : undefined}
      onPress={onPress}
      className="z-10 min-h-12 flex-row items-center gap-2 border-b border-relisten-blue-500/15 bg-relisten-blue-900 px-6 pb-3 pt-2.5"
    >
      <MaterialIcons color="rgba(101, 226, 255, 0.78)" name={icon} size={19} />
      <RelistenText
        className="shrink text-sm font-semibold uppercase tracking-widest text-relisten-blue-200/80"
        numberOfLines={1}
        selectable={false}
      >
        {label}
      </RelistenText>
      <View className="h-px flex-1 bg-relisten-blue-500/15" />
      {count !== undefined && (
        <RelistenText className="text-sm text-gray-300/80" selectable={false}>
          {count} {count === 1 ? 'track' : 'tracks'}
        </RelistenText>
      )}
    </Container>
  );
}
