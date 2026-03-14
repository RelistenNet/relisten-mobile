import { useSyncExternalStore } from 'react';
import { UserSettings } from '@/relisten/realm/models/user_settings';
import { useUserSettingsStore } from '@/relisten/realm/root_services';

export const useUserSettings = () => {
  const store = useUserSettingsStore();
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store.current() as UserSettings;
};
