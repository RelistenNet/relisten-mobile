import { Platform } from 'react-native';
import { CarPlay } from '@g4rb4g3/react-native-carplay';
import { RelistenApiClient } from '@/relisten/api/client';
import { setupCarPlay } from '@/relisten/carplay/templates';
import { openRealm } from '@/relisten/realm/schema';
import { Realm } from '@realm/react';
import { PlaybackSource, sharedStates } from '@/relisten/player/shared_state';
import { RelistenPlayer } from '@/relisten/player/relisten_player';

type CarPlayDependencyInput = {
  apiClient?: RelistenApiClient;
  realm?: Realm;
};

let providedApiClient: RelistenApiClient | null = null;
let providedRealm: Realm | null = null;
let teardown: (() => void) | null = null;
let connected = false;
let setupInFlight: Promise<void> | null = null;

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

  // If we already have an active template stack, keep it to avoid resetting CarPlay UI.
  // The provided dependencies will be used on the next setup (e.g., after disconnect/reconnect).
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
