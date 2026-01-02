import { useCallback, useEffect, useRef } from 'react';
import { Realm } from '@realm/react';
import { CarPlay } from '@g4rb4g3/react-native-carplay/src';
import { RelistenApiClient } from '@/relisten/api/client';
import { setupCarPlay } from '@/relisten/carplay/templates';

export function useCarPlaySetup(apiClient: RelistenApiClient, realm?: Realm) {
  const apiClientRef = useRef(apiClient);
  const realmRef = useRef(realm);
  const isCarPlayConnected = useRef(false);
  const hasSetupCarPlay = useRef(false);
  const teardownRef = useRef<(() => void) | null>(null);

  const trySetupCarPlay = useCallback(() => {
    if (hasSetupCarPlay.current) return;
    if (!realmRef.current || !isCarPlayConnected.current) return;

    teardownRef.current = setupCarPlay(realmRef.current, apiClientRef.current);
    hasSetupCarPlay.current = true;
  }, []);

  useEffect(() => {
    const handleConnect = () => {
      isCarPlayConnected.current = true;
      trySetupCarPlay();
    };

    const handleDisconnect = () => {
      isCarPlayConnected.current = false;
      hasSetupCarPlay.current = false;
      teardownRef.current?.();
      teardownRef.current = null;
    };

    CarPlay.registerOnConnect(handleConnect);
    CarPlay.registerOnDisconnect(handleDisconnect);

    if (CarPlay.connected) {
      isCarPlayConnected.current = true;
      trySetupCarPlay();
    }

    return () => {
      CarPlay.unregisterOnConnect(handleConnect);
      CarPlay.unregisterOnDisconnect(handleDisconnect);
      handleDisconnect();
    };
  }, [trySetupCarPlay]);

  useEffect(() => {
    apiClientRef.current = apiClient;
  }, [apiClient]);

  useEffect(() => {
    realmRef.current = realm;
    trySetupCarPlay();
  }, [realm, trySetupCarPlay]);
}
