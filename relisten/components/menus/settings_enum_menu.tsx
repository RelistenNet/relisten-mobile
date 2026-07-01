import { RelistenButton } from '@/relisten/components/relisten_button';
import { NativeMenuView, type MenuAction } from '@/relisten/components/menus/native_menu_view';
import { useMemo } from 'react';

type SettingsEnumOption = {
  label: string;
  value: string;
};

type SettingsEnumMenuProps<T extends SettingsEnumOption> = {
  currentValue: string;
  onValueChange: (option: T) => void;
  options: readonly T[];
};

export function SettingsEnumMenu<T extends SettingsEnumOption>({
  currentValue,
  onValueChange,
  options,
}: SettingsEnumMenuProps<T>) {
  const currentLabel =
    options.find((option) => option.value === currentValue)?.label ?? currentValue;
  const actions = useMemo<MenuAction[]>(
    () =>
      options.map((option) => ({
        id: option.value,
        state: option.value === currentValue ? 'on' : 'off',
        title: option.label,
      })),
    [currentValue, options]
  );

  return (
    <NativeMenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const selectedOption = options.find((option) => option.value === nativeEvent.event);

        if (selectedOption) {
          onValueChange(selectedOption);
        }
      }}
    >
      <RelistenButton accessibilityLabel={`Select ${currentLabel}`}>{currentLabel}</RelistenButton>
    </NativeMenuView>
  );
}
