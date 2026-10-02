import { Platform } from 'react-native';
import { CarPlay } from '@g4rb4g3/react-native-carplay';
import { RelistenApiClient } from '@/relisten/api/client';
import { setupCarPlay } from '@/relisten/carplay/templates';
import { openRealm } from '@/relisten/realm/schema';
import { Realm } from '@realm/react';
import { PlaybackSource, sharedStates } from '@/relisten/player/shared_state';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import { LibraryIndex } from '@/relisten/realm/library_index';
import { UserSettingsStore } from '@/relisten/realm/user_settings_store';
import { AccountScopeStore } from '@/relisten/accounts/account_scope_store';

type CarPlayDependencyInput = {
  accountGeneration?: number;
  apiClient?: RelistenApiClient;
  realm?: Realm;
  libraryIndex?: LibraryIndex;
  userSettingsStore?: UserSettingsStore;
};

let providedApiClient: RelistenApiClient | null = null;
let providedRealm: Realm | null = null;
let providedLibraryIndex: LibraryIndex | null = null;
let providedUserSettingsStore: UserSettingsStore | null = null;
let providedAccountGeneration: number | null = null;
let ownedLibraryIndex: LibraryIndex | null = null;
let ownedAccountScopeStore: AccountScopeStore | null = null;
let ownedUserSettingsStore: UserSettingsStore | null = null;
let teardown: (() => void) | null = null;
let connected = false;
let setupInFlight: Promise<void> | null = null;
let activeSetupGeneration: number | null = null;
let dependencyRevision = 0;

const ensureApiClient = () => {
  if (!providedApiClient) {
    providedApiClient = new RelistenApiClient();
  }

  return providedApiClient;
};

const ensureRealm = async () => {
  if (providedRealm) {
    return providedRealm;
  }

  return openRealm();
};

const ensureLibraryIndex = async () => {
  if (providedLibraryIndex) {
    return providedLibraryIndex;
  }

  const realm = await ensureRealm();
  ownedAccountScopeStore = new AccountScopeStore(realm);
  ownedAccountScopeStore.start();
  providedAccountGeneration = ownedAccountScopeStore.capture().generation;
  ownedLibraryIndex = new LibraryIndex(realm, ownedAccountScopeStore);
  providedLibraryIndex = ownedLibraryIndex;
  return providedLibraryIndex;
};

const ensureUserSettingsStore = async () => {
  if (providedUserSettingsStore) {
    return providedUserSettingsStore;
  }

  const realm = await ensureRealm();
  ownedUserSettingsStore = new UserSettingsStore(realm);
  providedUserSettingsStore = ownedUserSettingsStore;
  return providedUserSettingsStore;
};

const ensureSetup = () => {
  if (!connected || teardown || setupInFlight) {
    return;
  }

  const setupGeneration = providedAccountGeneration;
  const setupDependencyRevision = dependencyRevision;
  setupInFlight = (async () => {
    const [realm, apiClient, libraryIndex, userSettingsStore] = await Promise.all([
      ensureRealm(),
      Promise.resolve(ensureApiClient()),
      ensureLibraryIndex(),
      ensureUserSettingsStore(),
    ]);

    if (
      !connected ||
      teardown ||
      providedAccountGeneration !== setupGeneration ||
      dependencyRevision !== setupDependencyRevision
    ) {
      return;
    }

    teardown = setupCarPlay(realm, apiClient, libraryIndex, userSettingsStore);
    activeSetupGeneration = setupGeneration;
  })()
    .catch((error) => {
      console.warn('CarPlay setup failed', error);
    })
    .finally(() => {
      setupInFlight = null;
      if (
        providedAccountGeneration !== setupGeneration ||
        dependencyRevision !== setupDependencyRevision
      ) {
        ensureSetup();
      }
    });
};

export const setCarPlayDependencies = ({
  accountGeneration,
  apiClient,
  realm,
  libraryIndex,
  userSettingsStore,
}: CarPlayDependencyInput) => {
  const accountGenerationChanged =
    accountGeneration !== undefined && accountGeneration !== providedAccountGeneration;
  const dependencyChanged =
    (apiClient !== undefined && apiClient !== providedApiClient) ||
    (realm !== undefined && realm !== providedRealm) ||
    (libraryIndex !== undefined && libraryIndex !== providedLibraryIndex) ||
    (userSettingsStore !== undefined && userSettingsStore !== providedUserSettingsStore);
  if (dependencyChanged) {
    dependencyRevision += 1;
  }

  if (
    connected &&
    teardown &&
    (dependencyChanged || (accountGenerationChanged && activeSetupGeneration !== accountGeneration))
  ) {
    // A live template context owns the old services and captured account rows.
    // Tear it down before replacing either so no nested screen survives a switch.
    teardown();
    teardown = null;
    activeSetupGeneration = null;
  }

  if (accountGeneration !== undefined) {
    providedAccountGeneration = accountGeneration;
  }

  if (apiClient) {
    providedApiClient = apiClient;
  }

  if (realm) {
    providedRealm = realm;
  }

  if (libraryIndex) {
    if (ownedLibraryIndex) {
      ownedLibraryIndex.tearDown();
      ownedLibraryIndex = null;
    }
    ownedAccountScopeStore?.tearDown();
    ownedAccountScopeStore = null;
    providedLibraryIndex = libraryIndex;
  }

  if (userSettingsStore) {
    if (ownedUserSettingsStore) {
      ownedUserSettingsStore.tearDown();
      ownedUserSettingsStore = null;
    }
    providedUserSettingsStore = userSettingsStore;
  }

  if (!connected) {
    return;
  }

  ensureSetup();
};

const registerCarPlayBootstrap = () => {
  if (Platform.OS !== 'ios') {
    return;
  }

  const prepareNativeAudioSession = () => {
    if (sharedStates.playbackSource.lastState() === PlaybackSource.Cast) {
      return;
    }

    // Ensure MPRemoteCommandCenter + Now Playing are ready for CarPlay controls,
    // even if the app is cold-started from the CarPlay UI.
    RelistenPlayer.DEFAULT_INSTANCE.prepareAudioSession();
  };

  const handleConnect = () => {
    connected = true;
    if (sharedStates.playbackSource.lastState() !== PlaybackSource.Cast) {
      sharedStates.playbackSource.setState(PlaybackSource.Native);
    }
    prepareNativeAudioSession();
    ensureSetup();
  };

  const handleDisconnect = () => {
    connected = false;
    teardown?.();
    teardown = null;
    activeSetupGeneration = null;
    const disconnectedLibraryIndex = ownedLibraryIndex;
    disconnectedLibraryIndex?.tearDown();
    ownedLibraryIndex = null;
    ownedAccountScopeStore?.tearDown();
    ownedAccountScopeStore = null;
    if (providedLibraryIndex === disconnectedLibraryIndex) {
      providedLibraryIndex = null;
    }
    const disconnectedUserSettingsStore = ownedUserSettingsStore;
    disconnectedUserSettingsStore?.tearDown();
    ownedUserSettingsStore = null;
    if (providedUserSettingsStore === disconnectedUserSettingsStore) {
      providedUserSettingsStore = null;
    }
  };

  CarPlay.registerOnConnect(handleConnect);
  CarPlay.registerOnDisconnect(handleDisconnect);

  if (CarPlay.connected) {
    connected = true;
    prepareNativeAudioSession();
    ensureSetup();
  }
};

registerCarPlayBootstrap();
