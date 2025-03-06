import { useObject, useRealm } from '@/relisten/realm/schema';
import { DEFAULT_SETTINGS_SENTINEL, UserSettings } from '@/relisten/realm/models/user_settings';

export const useUserSettings = () => {
  const realm = useRealm();
  const liveObject = useObject(UserSettings, DEFAULT_SETTINGS_SENTINEL);

  return liveObject ?? UserSettings.defaultObject(realm);
};
