import React, { PropsWithChildren, useContext, useMemo } from 'react';

export type RelistenTabGroupSegment = '(artists)' | '(myLibrary)' | '(offline)';

type RelistenNavigationContextValue = {
  groupSegment: RelistenTabGroupSegment;
};

const RelistenNavigationContext = React.createContext<RelistenNavigationContextValue | undefined>(
  undefined
);

export function RelistenNavigationProvider({
  children,
  groupSegment,
}: PropsWithChildren<{ groupSegment: RelistenTabGroupSegment }>) {
  const value = useMemo(() => ({ groupSegment }), [groupSegment]);

  return React.createElement(RelistenNavigationContext.Provider, { value }, children);
}

export const useGroupSegment = (): RelistenTabGroupSegment => {
  const navigation = useContext(RelistenNavigationContext);
  return navigation?.groupSegment ?? '(artists)';
};

export const useIsOfflineTab = () => {
  return useGroupSegment() === '(offline)';
};
