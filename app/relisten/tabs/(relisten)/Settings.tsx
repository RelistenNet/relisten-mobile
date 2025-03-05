import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import {
  DEFAULT_SETTINGS_OBJ,
  DEFAULT_SETTINGS_SENTINAL,
  UserSettings,
} from '@/relisten/realm/models/user_settings';
import { useObject, useRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useState } from 'react';
import { Switch, SwitchProps } from 'react-native';

const SETTINGS = [
  {
    label: 'Track Listening History',
    subtitle: '(affects offline tracking only)',
    type: 'bool',
    key: 'trackListeningHistory',
  },
  {
    label: 'Download via Cellular',
    subtitle: '(will still stream via cellular)',
    type: 'bool',
    key: 'allowDownloadViaCellularData',
  },
  {
    label: 'Offline Mode',
    subtitle: '(only display offline tracks)',
    type: 'bool',
    key: 'offlineMode',
  },
  {
    label: 'Show Offline Tab',
    subtitle: '(offline tab)',
    type: 'bool',
    key: 'showOfflineTab',
  },
  {
    label: 'Autocache Streamed Music',
    subtitle: '(save streamed music to local cache)',
    type: 'bool',
    key: 'autocacheStreamedMusic',
  },
  {
    label: 'Autocache Min. Free Space',
    subtitle: '(min. free storage before deleting tracks)',
    type: 'int',
    key: 'autocacheMinAvailableStorageMB',
  },
  {
    label: 'Autocache Delete First',
    subtitle: '(what do you want to delete first)',
    type: 'enum',
    key: 'autocacheDeleteFirst',
  },
] as const;

export const useUserSettings = () => {
  return useObject(UserSettings, DEFAULT_SETTINGS_SENTINAL) ?? DEFAULT_SETTINGS_OBJ;
};

function InternalSwitch(props: SwitchProps) {
  const [internalValue, setInternalValue] = useState<boolean | undefined>(undefined);

  const onValueChange = (nextValue: boolean) => {
    setInternalValue(nextValue);
    props.onValueChange?.(nextValue);
  };

  const value = internalValue ?? props.value;

  return (
    <Switch
      trackColor={{ false: RelistenBlue[500], true: RelistenBlue[500] }}
      thumbColor={value ? 'white' : '#f4f3f4'}
      ios_backgroundColor="#3e3e3e"
      value={value}
      {...props}
      onValueChange={onValueChange}
    />
  );
}

export default function Settings() {
  const realm = useRealm();
  const settings = useUserSettings();

  const onValueChange = (setting: (typeof SETTINGS)[number]) => (nextValue: boolean) => {
    UserSettings.upsert(realm, { [setting.key]: nextValue } as any);
  };

  return (
    <Flex column cn="gap-2 my-2">
      <RelistenText cn="font-semibold tracking-wide">Settings</RelistenText>

      {SETTINGS.map((setting) => (
        <Flex key={setting.key} cn="items-center justify-between">
          <Flex column>
            <RelistenText cn="font-semibold">{setting.label}</RelistenText>
            <RelistenText cn="text-sm text-gray-400">{setting.subtitle}</RelistenText>
          </Flex>
          {setting.type === 'bool' && (
            <InternalSwitch value={settings[setting.key]} onValueChange={onValueChange(setting)} />
          )}
          {setting.type === 'int' && <RelistenText>TODO</RelistenText>}
          {setting.type === 'enum' && <RelistenText>TODO</RelistenText>}
        </Flex>
      ))}
    </Flex>
  );
}
