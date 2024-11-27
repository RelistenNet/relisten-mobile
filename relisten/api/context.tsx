import React, { PropsWithChildren, useContext, useEffect, useMemo } from 'react';
import { RelistenApiClient } from './client';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { PlaybackHistoryReporter } from '@/relisten/playback_history_reporter';
import { useRealm } from '@/relisten/realm/schema';

export const RelistenApiContext = React.createContext<
  { apiClient: RelistenApiClient; playbackHistoryReporter: PlaybackHistoryReporter } | undefined
>(undefined);

export const RelistenApiProvider: React.FC<PropsWithChildren<{}>> = ({ children }) => {
  const apiClient = useMemo(() => new RelistenApiClient(), []);
  const realm = useRealm();
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();

  const playbackHistoryReporter = useMemo(() => {
    return new PlaybackHistoryReporter(apiClient, realm);
  }, [realm, apiClient]);

  useEffect(() => {
    if (shouldMakeNetworkRequests) {
      playbackHistoryReporter.onNetworkAvailable();
    } else {
      playbackHistoryReporter.onNetworkUnavailable();
    }
  }, [shouldMakeNetworkRequests]);

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
