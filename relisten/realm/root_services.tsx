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

const NOOP_UNSUBSCRIBE = () => {};

function useKeyedLibraryIndexSubscription(
  libraryIndex: LibraryIndex,
  key: string | null | undefined,
  subscribe: (key: string, listener: () => void) => () => void,
  getSnapshot: (key: string) => number
) {
  useSyncExternalStore(
    key ? (listener) => subscribe(key, listener) : () => NOOP_UNSUBSCRIBE,
    key ? () => getSnapshot(key) : () => 0,
    key ? () => getSnapshot(key) : () => 0
  );

  return libraryIndex;
}

export function useLibraryIndex() {
  const { libraryIndex } = useRootServices();

  useSyncExternalStore(libraryIndex.subscribe, libraryIndex.getSnapshot, libraryIndex.getSnapshot);

  return libraryIndex;
}

export function useLibraryMembershipIndex() {
  const { libraryIndex } = useRootServices();

  useSyncExternalStore(
    libraryIndex.subscribeLibraryMembership,
    libraryIndex.getLibraryMembershipSnapshot,
    libraryIndex.getLibraryMembershipSnapshot
  );

  return libraryIndex;
}

export function useOfflineAvailabilityIndex() {
  const { libraryIndex } = useRootServices();

  useSyncExternalStore(
    libraryIndex.subscribeOfflineAvailability,
    libraryIndex.getOfflineAvailabilitySnapshot,
    libraryIndex.getOfflineAvailabilitySnapshot
  );

  return libraryIndex;
}

export function useRemainingDownloadsCount() {
  const { libraryIndex } = useRootServices();

  useSyncExternalStore(
    libraryIndex.subscribeRemainingDownloads,
    libraryIndex.getRemainingDownloadsSnapshot,
    libraryIndex.getRemainingDownloadsSnapshot
  );

  return libraryIndex.remainingDownloadsCount();
}

export function useHasRemainingDownloads() {
  return useRemainingDownloadsCount() > 0;
}

export function useArtistIsInLibrary(artistUuid?: string | null) {
  const { libraryIndex: rootLibraryIndex } = useRootServices();
  const libraryIndex = useKeyedLibraryIndexSubscription(
    rootLibraryIndex,
    artistUuid,
    rootLibraryIndex.subscribeArtistLibrary,
    rootLibraryIndex.getArtistLibrarySnapshot
  );

  return libraryIndex.artistIsInLibrary(artistUuid);
}

export function useYearIsInLibrary(yearUuid?: string | null) {
  const { libraryIndex: rootLibraryIndex } = useRootServices();
  const libraryIndex = useKeyedLibraryIndexSubscription(
    rootLibraryIndex,
    yearUuid,
    rootLibraryIndex.subscribeYearLibrary,
    rootLibraryIndex.getYearLibrarySnapshot
  );

  return libraryIndex.yearIsInLibrary(yearUuid);
}

export function useShowIsInLibrary(showUuid?: string | null) {
  const { libraryIndex: rootLibraryIndex } = useRootServices();
  const libraryIndex = useKeyedLibraryIndexSubscription(
    rootLibraryIndex,
    showUuid,
    rootLibraryIndex.subscribeShowLibrary,
    rootLibraryIndex.getShowLibrarySnapshot
  );

  return libraryIndex.showIsInLibrary(showUuid);
}

export function useArtistHasOfflineTracks(artistUuid?: string | null) {
  const { libraryIndex: rootLibraryIndex } = useRootServices();
  const libraryIndex = useKeyedLibraryIndexSubscription(
    rootLibraryIndex,
    artistUuid,
    rootLibraryIndex.subscribeArtistOfflineTracks,
    rootLibraryIndex.getArtistOfflineTracksSnapshot
  );

  return libraryIndex.artistHasOfflineTracks(artistUuid);
}

export function useYearHasOfflineTracks(yearUuid?: string | null) {
  const { libraryIndex: rootLibraryIndex } = useRootServices();
  const libraryIndex = useKeyedLibraryIndexSubscription(
    rootLibraryIndex,
    yearUuid,
    rootLibraryIndex.subscribeYearOfflineTracks,
    rootLibraryIndex.getYearOfflineTracksSnapshot
  );

  return libraryIndex.yearHasOfflineTracks(yearUuid);
}

export function useShowHasOfflineTracks(showUuid?: string | null) {
  const { libraryIndex: rootLibraryIndex } = useRootServices();
  const libraryIndex = useKeyedLibraryIndexSubscription(
    rootLibraryIndex,
    showUuid,
    rootLibraryIndex.subscribeShowOfflineTracks,
    rootLibraryIndex.getShowOfflineTracksSnapshot
  );

  return libraryIndex.showHasOfflineTracks(showUuid);
}

export function useSourceHasOfflineTracks(sourceUuid?: string | null) {
  const { libraryIndex: rootLibraryIndex } = useRootServices();
  const libraryIndex = useKeyedLibraryIndexSubscription(
    rootLibraryIndex,
    sourceUuid,
    rootLibraryIndex.subscribeSourceOfflineTracks,
    rootLibraryIndex.getSourceOfflineTracksSnapshot
  );

  return libraryIndex.sourceHasOfflineTracks(sourceUuid);
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
