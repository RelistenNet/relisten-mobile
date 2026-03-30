import React, { PropsWithChildren, useContext, useMemo } from 'react';
import { useSegments } from 'expo-router';

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

export const useRoute = (nextRoute?: string) => {
  const segments = useSegments();

  if (nextRoute) {
    return '/' + segments.concat(nextRoute).join('/');
  }

  return segments.length > 0 ? '/' + segments.join('/') : '/';
};

export const useGroupSegment = (): RelistenTabGroupSegment => {
  const navigation = useContext(RelistenNavigationContext);
  return navigation?.groupSegment ?? '(artists)';
};

export const useIsOfflineTab = () => {
  return useGroupSegment() === '(offline)';
};
