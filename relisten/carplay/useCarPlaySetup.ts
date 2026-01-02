import { useCallback, useEffect, useRef } from 'react';
import { Realm } from '@realm/react';
import { CarPlay } from '@g4rb4g3/react-native-carplay/src';
import { RelistenApiClient } from '@/relisten/api/client';
import { setupCarPlay } from '@/relisten/carplay/templates';

export function useCarPlaySetup(apiClient: RelistenApiClient, realm?: Realm) {
  const isCarPlayConnected = useRef(false);
  const hasSetupCarPlay = useRef(false);
  const teardownRef = useRef<(() => void) | null>(null);

  const trySetupCarPlay = useCallback(() => {
    if (hasSetupCarPlay.current) return;
    if (!realm || !isCarPlayConnected.current) return;

    teardownRef.current = setupCarPlay(realm, apiClient);
    hasSetupCarPlay.current = true;
  }, [apiClient, realm]);

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

    return () => {
      CarPlay.unregisterOnConnect(handleConnect);
      CarPlay.unregisterOnDisconnect(handleDisconnect);
      handleDisconnect();
    };
  }, [trySetupCarPlay]);

  useEffect(() => {
    trySetupCarPlay();
  }, [trySetupCarPlay]);
}
