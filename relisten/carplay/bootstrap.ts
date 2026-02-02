import { Platform } from 'react-native';
import { CarPlay } from '@g4rb4g3/react-native-carplay/src';
import { RelistenApiClient } from '@/relisten/api/client';
import { setupCarPlay } from '@/relisten/carplay/templates';
import { openRealm } from '@/relisten/realm/schema';
import { Realm } from '@realm/react';

type CarPlayDependencyInput = {
  apiClient?: RelistenApiClient;
  realm?: Realm;
};

let providedApiClient: RelistenApiClient | null = null;
let providedRealm: Realm | null = null;
let teardown: (() => void) | null = null;
let connected = false;
let setupInFlight: Promise<void> | null = null;
let setupSource: 'provided' | 'fallback' | null = null;

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

const ensureSetup = () => {
  if (!connected || teardown || setupInFlight) {
    return;
  }

  setupInFlight = (async () => {
    const [realm, apiClient] = await Promise.all([
      ensureRealm(),
      Promise.resolve(ensureApiClient()),
    ]);

    if (!connected || teardown) {
      return;
    }

    teardown = setupCarPlay(realm, apiClient);
    setupSource = providedRealm && providedApiClient ? 'provided' : 'fallback';
  })()
    .catch((error) => {
      console.warn('CarPlay setup failed', error);
    })
    .finally(() => {
      setupInFlight = null;
    });
};

export const setCarPlayDependencies = ({ apiClient, realm }: CarPlayDependencyInput) => {
  if (apiClient) {
    providedApiClient = apiClient;
  }

  if (realm) {
    providedRealm = realm;
  }

  if (!connected) {
    return;
  }

  if (teardown && setupSource === 'fallback' && providedApiClient && providedRealm) {
    teardown();
    teardown = null;
    setupSource = null;
  }

  ensureSetup();
};

const registerCarPlayBootstrap = () => {
  if (Platform.OS !== 'ios') {
    return;
  }

  const handleConnect = () => {
    connected = true;
    ensureSetup();
  };

  const handleDisconnect = () => {
    connected = false;
    teardown?.();
    teardown = null;
    setupSource = null;
  };

  CarPlay.registerOnConnect(handleConnect);
  CarPlay.registerOnDisconnect(handleDisconnect);

  if (CarPlay.connected) {
    connected = true;
    ensureSetup();
  }
};

registerCarPlayBootstrap();
