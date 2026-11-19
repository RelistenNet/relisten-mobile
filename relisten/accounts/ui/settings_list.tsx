import { ListRow } from '@/relisten/components/list_row';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { SectionHeader } from '@/relisten/components/section_header';
import { Children, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';

/** A section in the app's list style: a band header, then rows with subtle separators. */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View>
      {title && <SectionHeader title={title} />}
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 && <ItemSeparator />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** A two-line row: a title and, under it, its current value or status. */
export function SettingsRow({
  label,
  value,
  valueClassName,
  disabled,
  onPress,
}: {
  label: string;
  value?: string;
  valueClassName?: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <ListRow
      title={label}
      subtitle={value}
      subtitleClassName={valueClassName}
      disabled={disabled}
      disclosure={onPress !== undefined}
      onPress={onPress}
    />
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
