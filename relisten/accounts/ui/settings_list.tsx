import { RelistenText } from '@/relisten/components/relisten_text';
import { tw } from '@/relisten/util/tw';
import { MaterialIcons } from '@expo/vector-icons';
import { Children, Fragment, type ReactNode } from 'react';
import { TouchableOpacity, View } from 'react-native';

/** A rounded group of rows with hairlines between them, like an iOS Settings section. */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View className="mx-4 mb-6">
      {title && (
        <RelistenText className="mb-2 ml-4 text-sm uppercase text-gray-400" selectable={false}>
          {title}
        </RelistenText>
      )}
      <View className="overflow-hidden rounded-xl bg-relisten-blue-800">
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && <View className="ml-4 h-px bg-white/10" />}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/** One settings row: a label, an optional value on the right, and a chevron when it opens something. */
export function SettingsRow({
  label,
  value,
  valueClassName,
  tone = 'default',
  disabled,
  onPress,
  disclosure,
}: {
  label: string;
  value?: string;
  valueClassName?: string;
  tone?: 'default' | 'action' | 'destructive';
  disabled?: boolean;
  onPress?: () => void;
  disclosure?: boolean;
}) {
  const showDisclosure = disclosure ?? (onPress !== undefined && tone === 'default');
  const content = (
    <View
      className={tw('min-h-[48px] flex-row items-center px-4 py-3', {
        'opacity-40': disabled,
      })}
    >
      <RelistenText
        className={tw('shrink', {
          'text-relisten-blue-400': tone === 'action',
          'text-red-400': tone === 'destructive',
        })}
        selectable={false}
      >
        {label}
      </RelistenText>
      <View className="min-w-[16px] flex-1" />
      {value !== undefined && (
        <RelistenText
          className={tw('shrink text-right text-gray-400', valueClassName)}
          numberOfLines={2}
          selectable={false}
        >
          {value}
        </RelistenText>
      )}
      {showDisclosure && <MaterialIcons color="#9ca3af" name="chevron-right" size={22} />}
    </View>
  );

  if (!onPress) {
    return content;
  }
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

/** "just now", "5 min ago", "3 hr ago", then a date. */
export function relativeTime(date: Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  if (minutes < 24 * 60) {
    return `${Math.floor(minutes / 60)} hr ago`;
  }
  return date.toLocaleDateString();
}
