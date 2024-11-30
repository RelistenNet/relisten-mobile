import React, { PropsWithChildren, useContext } from 'react';
import { NetworkBackedResults } from '../realm/network_backed_results';
import { RelistenApiClientError } from '@/relisten/api/client';

export interface RefreshContextProps {
  refreshing: boolean;
  errors?: RelistenApiClientError[] | undefined;
  hasData?: boolean;
  onRefresh: (force?: boolean) => void;
}

export const RefreshContext = React.createContext<RefreshContextProps | undefined>(undefined);
export const RefreshContextProvider = <T extends object>({
  children,
  networkBackedResults,
  extraRefreshingConsideration,
}: PropsWithChildren<{
  networkBackedResults?: NetworkBackedResults<T | undefined>;
  extraRefreshingConsideration?: (
    networkBackedResults: NetworkBackedResults<T | undefined>
  ) => boolean;
}>) => {
  if (!networkBackedResults) return children;

  let refreshing = networkBackedResults.isNetworkLoading;

  if (extraRefreshingConsideration) {
    refreshing ||= extraRefreshingConsideration(networkBackedResults);
  }

  refreshing ||=
    networkBackedResults.data === undefined &&
    !(networkBackedResults.errors && networkBackedResults.errors.length > 0);

  return (
    <RefreshContext.Provider
      value={{
        refreshing,
        errors: networkBackedResults.errors,
        onRefresh: networkBackedResults.refresh,
        hasData: !!networkBackedResults.data,
      }}
    >
      {children}
    </RefreshContext.Provider>
  );
};
export const useRefreshContext = (refreshRequired = true) => {
  const context = useContext(RefreshContext);

  if (context === undefined) {
    if (refreshRequired) {
      throw new Error('useRefreshContext must be used within a RefreshContextProvider');
    }

    return { refreshing: false, onRefresh: () => {} };
  }

  return context;
};
