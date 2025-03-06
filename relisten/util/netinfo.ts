import { useNetInfo } from '@react-native-community/netinfo';
import { useUserSettings } from '@/relisten/realm/models/user_settings_repo';
import { OfflineModeSetting } from '@/relisten/realm/models/user_settings';

export function useShouldMakeNetworkRequests(): boolean {
  const { type } = useNetInfo();
  const userSettings = useUserSettings();

  if (userSettings.offlineModeWithDefault() === OfflineModeSetting.AlwaysOffline) {
    return false;
  }

  return type != 'none';
}
