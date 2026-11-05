import { PlaybackHistoryReporter } from '@/relisten/playback_history_reporter';
import { retryCatalogRequests } from '@/relisten/realm/network_backed_behavior';
import { useRealm } from '@/relisten/realm/schema';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import React, { PropsWithChildren, useContext, useEffect, useMemo } from 'react';
import { RelistenApiClient } from './client';

export const RelistenApiContext = React.createContext<
  { apiClient: RelistenApiClient; playbackHistoryReporter: PlaybackHistoryReporter } | undefined
>(undefined);

export const RelistenApiProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const realm = useRealm();
  const apiClient = useMemo(() => new RelistenApiClient(), []);
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();

  const playbackHistoryReporter = useMemo(() => {
    return new PlaybackHistoryReporter(apiClient, realm);
  }, [realm, apiClient]);

  useEffect(() => {
    if (shouldMakeNetworkRequests) {
      playbackHistoryReporter.onNetworkAvailable();
      void retryCatalogRequests(realm);
    } else {
      playbackHistoryReporter.onNetworkUnavailable();
    }
  }, [playbackHistoryReporter, shouldMakeNetworkRequests, realm]);

  return (
    <RelistenApiContext.Provider value={{ apiClient, playbackHistoryReporter }}>
      {children}
    </RelistenApiContext.Provider>
  );
};

export const useRelistenApi = () => {
  const context = useContext(RelistenApiContext);

  if (context === undefined) {
    throw new Error('useRelistenApi must be used within a RelistenApiProvider');
  }

  return context;
};
