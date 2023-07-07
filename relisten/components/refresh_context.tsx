import React, { PropsWithChildren, useContext } from 'react';
import { NetworkBackedResults } from '../realm/network_backed_results';

export interface RefreshContextProps {
  refreshing: boolean;
  onRefresh: () => void;
}

export const RefreshContext = React.createContext<RefreshContextProps | undefined>(undefined);
export const RefreshContextProvider = <T extends object>({
  children,
  networkBackedResults,
}: PropsWithChildren<{
  networkBackedResults: NetworkBackedResults<T>;
}>) => {
  const refreshing =
    networkBackedResults.shouldShowLoadingIndicator || networkBackedResults.isNetworkLoading;

  return (
    <RefreshContext.Provider
      value={{
        refreshing,
        onRefresh: networkBackedResults.refresh,
      }}
    >
      {children}
    </RefreshContext.Provider>
  );
};
export const useRefreshContext = () => {
  const context = useContext(RefreshContext);

  if (context === undefined) {
    throw new Error('useRefreshContext must be used within a RefreshContextProvider');
  }

  return context;
};
