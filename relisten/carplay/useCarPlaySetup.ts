import { useEffect } from 'react';
import { Realm } from '@realm/react';
import { RelistenApiClient } from '@/relisten/api/client';
import { setCarPlayDependencies } from '@/relisten/carplay/bootstrap';
import { LibraryIndex } from '@/relisten/realm/library_index';
import { UserSettingsStore } from '@/relisten/realm/user_settings_store';

export function useCarPlaySetup(
  apiClient: RelistenApiClient,
  realm: Realm | undefined,
  libraryIndex: LibraryIndex,
  userSettingsStore: UserSettingsStore
) {
  useEffect(() => {
    setCarPlayDependencies({ apiClient, realm, libraryIndex, userSettingsStore });
  }, [apiClient, realm, libraryIndex, userSettingsStore]);
}
