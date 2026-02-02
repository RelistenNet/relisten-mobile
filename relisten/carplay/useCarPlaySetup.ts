import { useEffect } from 'react';
import { Realm } from '@realm/react';
import { RelistenApiClient } from '@/relisten/api/client';
import { setCarPlayDependencies } from '@/relisten/carplay/bootstrap';

export function useCarPlaySetup(apiClient: RelistenApiClient, realm?: Realm) {
  useEffect(() => {
    setCarPlayDependencies({ apiClient, realm });
  }, [apiClient, realm]);
}
