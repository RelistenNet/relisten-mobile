import { useRelistenPlayerPlaybackState } from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerQueueOrderedTracks } from '@/relisten/player/relisten_player_queue_hooks';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import React, { PropsWithChildren, useContext, useState } from 'react';
import { Platform, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { useCompatibleNativeTabsBottomInset } from './native_tabs_inset';

export type PlayerBarPlacementBackend = 'nativeTabsAccessory' | 'overlay';

export interface PlayerBarLayout {
  visualHeight: number;
  reservedContentInset: number;
  placementOffset: number;
}

export interface RelistenPlayerBottomBarContextProps {
  playerBottomBarHeight: number;
  setPlayerBottomBarHeight: (num: number) => void;
}

export const DEFAULT_PLAYER_BOTTOM_BAR_VISUAL_HEIGHT = 64;

export const RelistenPlayerBottomBarContext = React.createContext<
  RelistenPlayerBottomBarContextProps | undefined
>(undefined);

export const RelistenPlayerBottomBarProvider = ({ children }: PropsWithChildren<object>) => {
  const [playerBottomBarHeight, setPlayerBottomBarHeight] = useState(
    DEFAULT_PLAYER_BOTTOM_BAR_VISUAL_HEIGHT
  );

  return (
    <RelistenPlayerBottomBarContext.Provider
      value={{
        playerBottomBarHeight,
        setPlayerBottomBarHeight,
      }}
    >
      {children}
    </RelistenPlayerBottomBarContext.Provider>
  );
};

export const useRelistenPlayerBottomBarContext = () => {
  const context = useContext(RelistenPlayerBottomBarContext);

  if (context === undefined) {
    throw new Error(
      'useRelistenPlayerBottomBarContext must be used within a RelistenPlayerBottomBarProvider'
    );
  }

  return context;
};

export const useIsPlayerBottomBarVisible = () => {
  const playbackState = useRelistenPlayerPlaybackState();
  const tracks = useRelistenPlayerQueueOrderedTracks();

  return playbackState !== undefined && tracks.length > 0;
};

export const usePlayerBarVisualHeight = () => {
  const { playerBottomBarHeight } = useRelistenPlayerBottomBarContext();
  const isVisible = useIsPlayerBottomBarVisible();

  return isVisible ? playerBottomBarHeight : 0;
};

export const usePlayerBarReservedContentInset = () => {
  const visualHeight = usePlayerBarVisualHeight();
  const placementBackend = usePlayerBarPlacementBackend();

  if (placementBackend === 'nativeTabsAccessory') {
    return 0;
  }

  return visualHeight;
};

export const usePlayerBottomScrollInset = () => {
  return usePlayerBarReservedContentInset();
};

export interface PlayerBottomScrollViewProps {
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollIndicatorInsets?: Insets;
}

export const usePlayerBottomScrollViewProps = ({
  contentContainerStyle,
  scrollIndicatorInsets,
}: PlayerBottomScrollViewProps = {}) => {
  const bottomInset = usePlayerBottomScrollInset();

  if (bottomInset <= 0) {
    return {
      contentContainerStyle,
      scrollIndicatorInsets,
    };
  }

  return {
    contentContainerStyle: [contentContainerStyle, { paddingBottom: bottomInset }],
    scrollIndicatorInsets: {
      ...scrollIndicatorInsets,
      bottom: Math.max(scrollIndicatorInsets?.bottom ?? 0, bottomInset),
    },
  };
};

export const getPlatformVersionNumber = (platformVersion: typeof Platform.Version) => {
  if (typeof platformVersion === 'number') {
    return platformVersion;
  }

  return Number.parseInt(platformVersion, 10);
};

const getPlayerBarPlacementBackendOverride = (): PlayerBarPlacementBackend | undefined => {
  if (!__DEV__) {
    return undefined;
  }

  const override = process.env.EXPO_PUBLIC_PLAYER_BAR_PLACEMENT_BACKEND;

  if (override === 'nativeTabsAccessory' || override === 'overlay') {
    return override;
  }

  return undefined;
};

export const resolvePlayerBarPlacementBackend = ({
  platformOs,
  platformVersion,
  placementBackendOverride,
}: {
  platformOs: typeof Platform.OS;
  platformVersion: typeof Platform.Version;
  placementBackendOverride?: PlayerBarPlacementBackend;
}): PlayerBarPlacementBackend => {
  if (placementBackendOverride) {
    return placementBackendOverride;
  }

  if (platformOs === 'ios' && getPlatformVersionNumber(platformVersion) >= 26) {
    return 'nativeTabsAccessory';
  }

  return 'overlay';
};

export const supportsNativeTabsBottomAccessory = () => {
  return (
    resolvePlayerBarPlacementBackend({
      placementBackendOverride: getPlayerBarPlacementBackendOverride(),
      platformOs: Platform.OS,
      platformVersion: Platform.Version,
    }) === 'nativeTabsAccessory'
  );
};

export const usePlayerBarPlacementBackend = (): PlayerBarPlacementBackend => {
  const placementBackendOverride = getPlayerBarPlacementBackendOverride();
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();

  // NativeTabs.BottomAccessory does not expose a reliable JS height control for the
  // stacked offline banner + mini-player layout, so offline falls back to overlay.
  if (!placementBackendOverride && !shouldMakeNetworkRequests) {
    return 'overlay';
  }

  return resolvePlayerBarPlacementBackend({
    placementBackendOverride,
    platformOs: Platform.OS,
    platformVersion: Platform.Version,
  });
};

export const usePlayerBarPlacementOffset = () => {
  return useCompatibleNativeTabsBottomInset();
};

export const usePlayerBarLayout = (): PlayerBarLayout => {
  const visualHeight = usePlayerBarVisualHeight();
  const reservedContentInset = usePlayerBarReservedContentInset();
  const placementOffset = usePlayerBarPlacementOffset();

  return {
    visualHeight,
    reservedContentInset,
    placementOffset,
  };
};

export const useNativeTabsStackContentInset = () => {
  return 0;
};
