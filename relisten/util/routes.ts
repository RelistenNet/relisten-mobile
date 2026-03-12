import React, { PropsWithChildren, useContext, useMemo } from 'react';
import { useSegments } from 'expo-router';

export type RelistenTabGroupSegment = '(artists)' | '(myLibrary)' | '(offline)' | undefined;

type RelistenNavigationContextValue = {
  groupSegment: RelistenTabGroupSegment;
};

const RelistenNavigationContext = React.createContext<RelistenNavigationContextValue | undefined>(
  undefined
);

export const relistenTabGroupFromSegments = (segments: ReadonlyArray<string>) => {
  const group = segments.at(2);

  if (!group) {
    return undefined;
  }

  return group as RelistenTabGroupSegment;
};

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

export const useGroupSegment = (fallback?: boolean): RelistenTabGroupSegment => {
  const navigation = useContext(RelistenNavigationContext);
  const group = navigation?.groupSegment;

  if (!group) {
    if (fallback) return '(artists)';
    return undefined;
  }

  return group as RelistenTabGroupSegment;
};

export const useIsOfflineTab = () => {
  return useGroupSegment() === '(offline)';
};
