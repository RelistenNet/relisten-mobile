import { useObject, useRealm } from '@/relisten/realm/schema';
import { DEFAULT_SETTINGS_SENTINEL, UserSettings } from '@/relisten/realm/models/user_settings';

let _calledDefaultObject = false;

export const useUserSettings = () => {
  const realm = useRealm();

  if (!_calledDefaultObject) {
    UserSettings.defaultObject(realm);
    _calledDefaultObject = true;
  }

  const liveObject = useObject(UserSettings, DEFAULT_SETTINGS_SENTINEL);

  return liveObject;
};
