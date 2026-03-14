import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useRealm } from '@/relisten/realm/schema';
import { LibraryIndex } from '@/relisten/realm/library_index';
import { UserSettingsStore } from '@/relisten/realm/user_settings_store';

export interface RootServices {
  libraryIndex: LibraryIndex;
  userSettingsStore: UserSettingsStore;
}

const RootServicesContext = createContext<RootServices | undefined>(undefined);

export function RootServicesProvider({ children }: PropsWithChildren) {
  const realm = useRealm();

  const services = useMemo<RootServices>(() => {
    return {
      libraryIndex: new LibraryIndex(realm),
      userSettingsStore: new UserSettingsStore(realm),
    };
  }, [realm]);

  useEffect(() => {
    return () => {
      services.libraryIndex.tearDown();
      services.userSettingsStore.tearDown();
    };
  }, [services]);

  return <RootServicesContext.Provider value={services}>{children}</RootServicesContext.Provider>;
}

function useRootServices() {
  const services = useContext(RootServicesContext);

  if (!services) {
    throw new Error('RootServicesProvider is required');
  }

  return services;
}

export function useLibraryIndex() {
  const { libraryIndex } = useRootServices();

  useSyncExternalStore(libraryIndex.subscribe, libraryIndex.getSnapshot, libraryIndex.getSnapshot);

  return libraryIndex;
}

export function useUserSettingsStore() {
  return useRootServices().userSettingsStore;
}

export function useRootLibraryIndex() {
  return useRootServices().libraryIndex;
}

export function useRootUserSettingsStore() {
  return useRootServices().userSettingsStore;
}
