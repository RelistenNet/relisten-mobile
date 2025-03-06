import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import {
  AutocacheDeleteFirstSetting,
  AutocacheStreamedMusicSetting,
  AutoplayDeepLinkToTrackSetting,
  DownloadViaCellularDataSetting,
  OfflineModeSetting,
  ShowOfflineTabSetting,
  TrackListeningHistorySetting,
  UserSettings,
  UserSettingsProps,
} from '@/relisten/realm/models/user_settings';
import { useRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useState } from 'react';
import { Switch, SwitchProps, TextInput, TextInputProps } from 'react-native';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { SectionHeader } from '@/relisten/components/section_header';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { RowWithAction } from '@/relisten/components/row_with_action';

interface BaseSettings {
  label: string;
  subtitle: string;
}

interface BoolSettingsEntry extends BaseSettings {
  type: 'bool';
  newSettings: (newValue: boolean) => Partial<UserSettingsProps>;
  currentSetting: (settings: UserSettings) => boolean;
}

interface IntSettingsEntry extends BaseSettings {
  type: 'int';
  newSettings: (newValue: number) => Partial<UserSettingsProps>;
  currentSetting: (settings: UserSettings) => number;
}

interface EnumSettingsEntryOption {
  label: string;
  subtitle?: string;
  value: string;
}

interface EnumSettingsEntry extends BaseSettings {
  type: 'enum';
  options: Array<EnumSettingsEntryOption>;
  newSettings: (newValue: EnumSettingsEntryOption) => Partial<UserSettingsProps>;
  currentSetting: (settings: UserSettings) => string;
}

type Settings = BoolSettingsEntry | IntSettingsEntry | EnumSettingsEntry;

const SETTINGS: Array<Settings> = [
  {
    label: 'Track Listening History',
    subtitle: "If you turn this off, you won't be able to see recently played shows.",
    type: 'bool',
    newSettings: (newValue: boolean): Partial<UserSettingsProps> => {
      return {
        trackListeningHistory: newValue
          ? TrackListeningHistorySetting.Always
          : TrackListeningHistorySetting.Never,
      };
    },
    currentSetting: (settings: UserSettings) => {
      return settings.trackListeningHistoryWithDefault() === TrackListeningHistorySetting.Always;
    },
  },
  // This is blocked on upstreaming support for `allowsCellularAccess` on iOS
  // https://github.com/kesha-antonov/react-native-background-downloader/issues/14
  //
  // {
  //   label: 'Download via Cellular',
  //   subtitle: 'Will still stream via cellular',
  //   type: 'bool',
  //   newSettings: (newValue: boolean): Partial<UserSettingsProps> => {
  //     return {
  //       downloadViaCellularData: newValue
  //         ? DownloadViaCellularDataSetting.Always
  //         : DownloadViaCellularDataSetting.Never,
  //     };
  //   },
  //   currentSetting: (settings: UserSettings) => {
  //     return (
  //       settings.downloadViaCellularDataWithDefault() === DownloadViaCellularDataSetting.Always
  //     );
  //   },
  // },
  {
    label: 'Offline Mode',
    subtitle: 'Only display tracks that can play offline',
    type: 'bool',
    newSettings: (newValue: boolean): Partial<UserSettingsProps> => {
      return {
        offlineMode: newValue ? OfflineModeSetting.AlwaysOffline : OfflineModeSetting.Automatic,
      };
    },
    currentSetting: (settings: UserSettings) => {
      return settings.offlineModeWithDefault() === OfflineModeSetting.AlwaysOffline;
    },
  },
  {
    label: 'Show Offline Tab',
    subtitle: 'Offline tab',
    type: 'enum',
    options: [
      { label: 'Always', value: ShowOfflineTabSetting.Always },
      { label: 'When Offline', value: ShowOfflineTabSetting.WhenOffline },
      { label: 'Never', value: ShowOfflineTabSetting.Never },
    ],
    newSettings: (newValue: EnumSettingsEntryOption): Partial<UserSettingsProps> => {
      return {
        showOfflineTab: newValue.value as ShowOfflineTabSetting,
      };
    },
    currentSetting: (settings: UserSettings) => {
      return settings.showOfflineTabWithDefault();
    },
  },
  {
    label: 'Autocache Streamed Music',
    subtitle: 'Save streamed music to local cache',
    type: 'bool',
    newSettings: (newValue: boolean): Partial<UserSettingsProps> => {
      return {
        autocacheStreamedMusic: newValue
          ? AutocacheStreamedMusicSetting.Always
          : AutocacheStreamedMusicSetting.Never,
      };
    },
    currentSetting: (settings: UserSettings) => {
      return settings.autocacheStreamedMusicWithDefault() === AutocacheStreamedMusicSetting.Always;
    },
  },
  {
    label: 'Autocache Min. Free Space',
    subtitle: 'Min. free storage before deleting tracks (in MB)',
    type: 'int',
    newSettings: (newValue: number): Partial<UserSettingsProps> => {
      return {
        autocacheMinAvailableStorageMB: newValue,
      };
    },
    currentSetting: (settings: UserSettings) => {
      return settings.autocacheMinAvailableStorageMBWithDefault();
    },
  },
  {
    label: 'Autocache Delete First',
    subtitle: 'What do you want to delete first',
    type: 'enum',
    options: [
      { label: 'Oldest Played', value: AutocacheDeleteFirstSetting.OldestPlayed },
      { label: 'Oldest Cached', value: AutocacheDeleteFirstSetting.OldestCached },
    ],
    newSettings: (newValue: EnumSettingsEntryOption): Partial<UserSettingsProps> => {
      return {
        autocacheDeleteFirst: newValue.value as AutocacheDeleteFirstSetting,
      };
    },
    currentSetting: (settings: UserSettings) => {
      return settings.autocacheDeleteFirstWithDefault();
    },
  },
  {
    label: 'Autoplay Deep Linked Tracks',
    subtitle:
      'Turn this off to stop automatically playing a track when a relisten.net link opens in this app',
    type: 'bool',
    newSettings: (newValue: boolean): Partial<UserSettingsProps> => {
      return {
        autoplayDeepLinkToTrack: newValue
          ? AutoplayDeepLinkToTrackSetting.PlayTrack
          : AutoplayDeepLinkToTrackSetting.ShowSource,
      };
    },
    currentSetting: (settings: UserSettings) => {
      return (
        settings.autoplayDeepLinkToTrackWithDefault() === AutoplayDeepLinkToTrackSetting.PlayTrack
      );
    },
  },
] as const;

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

function InternalTextInput(props: TextInputProps) {
  const [internalValue, setInternalValue] = useState<string | undefined>(undefined);

  const onChangeText = (nextValue: string) => {
    setInternalValue(nextValue);
    props.onChangeText?.(nextValue);
  };

  const value = internalValue ?? props.value;

  return (
    <TextInput
      keyboardType="number-pad"
      value={value}
      className="rounded-lg border border-relisten-blue-800 px-4 py-2 text-white"
      onChangeText={onChangeText}
    />
  );
}

function EnumPicker({
  setting,
  settings,
  onValueChange,
}: {
  setting: EnumSettingsEntry;
  settings: UserSettings;
  onValueChange: (newValue: EnumSettingsEntryOption) => void;
}) {
  const { showActionSheetWithOptions } = useActionSheet();

  const currentValue = setting.currentSetting(settings);
  let currentLabel = currentValue;

  for (const option of setting.options) {
    if (option.value === currentValue) {
      currentLabel = option.label;
    }
  }

  const showOptions = () => {
    showActionSheetWithOptions(
      {
        options: [...setting.options.map((o) => o.label), 'Cancel'],
        cancelButtonIndex: setting.options.length,
      },
      (selectedIdx?: number) => {
        if (selectedIdx !== undefined && selectedIdx < setting.options.length) {
          onValueChange(setting.options[selectedIdx]);
        }
      }
    );
  };

  return <RelistenButton onPress={showOptions}>{currentLabel}</RelistenButton>;
}

export function RelistenSettings() {
  const realm = useRealm();
  const settings = useUserSettings();

  const onBoolValueChange = (setting: BoolSettingsEntry) => (nextValue: boolean) => {
    realm.write(() => {
      settings.upsert(setting.newSettings(nextValue));
    });
  };

  const onEnumValueChange =
    (setting: EnumSettingsEntry) => (nextValue: EnumSettingsEntryOption) => {
      realm.write(() => {
        settings.upsert(setting.newSettings(nextValue));
      });
    };

  const onIntValueChange = (setting: IntSettingsEntry) => (nextValue: string) => {
    const num = parseInt(nextValue.trim(), 10);

    if (!isNaN(num) && num != Infinity) {
      realm.write(() => {
        settings.upsert(setting.newSettings(num));
      });
    }
  };

  return (
    <Flex column>
      <SectionHeader title="Settings" />

      <Flex column className="gap-4 p-4">
        {SETTINGS.map((setting) => (
          <RowWithAction key={setting.label} title={setting.label} subtitle={setting.subtitle}>
            {setting.type === 'bool' && (
              <InternalSwitch
                value={setting.currentSetting(settings)}
                onValueChange={onBoolValueChange(setting)}
              />
            )}
            {setting.type === 'int' && (
              <InternalTextInput
                value={String(setting.currentSetting(settings))}
                onChangeText={onIntValueChange(setting)}
              />
            )}
            {setting.type === 'enum' && (
              <EnumPicker
                setting={setting}
                settings={settings}
                onValueChange={onEnumValueChange(setting)}
              />
            )}
          </RowWithAction>
        ))}
      </Flex>
    </Flex>
  );
}
