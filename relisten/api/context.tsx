import React, { PropsWithChildren, useContext, useMemo } from 'react';
import { RelistenApiClient } from './client';

export const RelistenApiContext = React.createContext<{ apiClient: RelistenApiClient } | undefined>(
  undefined
);

export const RelistenApiProvider: React.FC<PropsWithChildren<{}>> = ({ children }) => {
  const apiClient = useMemo(() => new RelistenApiClient(), []);

  return (
    <RelistenApiContext.Provider value={{ apiClient }}>{children}</RelistenApiContext.Provider>
  );
};

export const useRelistenApi = () => {
  const context = useContext(RelistenApiContext);

  if (context === undefined) {
    throw new Error('useRelistenApi must be used within a RelistenApiProvider');
  }

  return context;
};
