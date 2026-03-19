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

  if (!navigation) {
    throw new Error('useGroupSegment must be used within a RelistenNavigationProvider');
  }

  return navigation.groupSegment;
};

export const useIsOfflineTab = () => {
  return useGroupSegment() === '(offline)';
};
