import React, { PropsWithChildren, useContext, useMemo } from 'react';

/**
 * The tabs whose stacks share the catalog screens in
 * `app/relisten/tabs/(artists,myLibrary,offline,search)`. Expo Router gives
 * each one its own copy of those routes, so a push stays in the tab it
 * started from.
 */
export const RELISTEN_TAB_GROUP_SEGMENTS = [
  '(artists)',
  '(myLibrary)',
  '(offline)',
  '(search)',
] as const;

export type RelistenTabGroupSegment = (typeof RELISTEN_TAB_GROUP_SEGMENTS)[number];

export function isRelistenTabGroupSegment(value: string): value is RelistenTabGroupSegment {
  return (RELISTEN_TAB_GROUP_SEGMENTS as readonly string[]).includes(value);
}

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

/**
 * Whether this tab still shows catalog rows that were deleted upstream.
 * Catalog browsing (Artists, Search) hides them. My Library and Offline keep
 * them, so a saved or downloaded copy still opens after the catalog drops it.
 */
export const useIncludesDeletedCatalog = (): boolean => {
  const groupSegment = useGroupSegment();
  return groupSegment === '(myLibrary)' || groupSegment === '(offline)';
};

export const useIsOfflineTab = () => {
  return useGroupSegment() === '(offline)';
};
