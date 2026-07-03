import { useRelistenPlayerPlaybackState } from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerQueueOrderedTracks } from '@/relisten/player/relisten_player_queue_hooks';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import React, { PropsWithChildren, useContext, useState } from 'react';
import { Platform, StyleSheet, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { useCompatibleNativeTabsBottomInset } from './native_tabs_inset';

export type PlayerBarPlacementBackend = 'nativeTabsAccessory' | 'overlay';

export interface RelistenPlayerBottomBarContextProps {
  bottomTabBarHeight?: number;
  playerBottomBarHeight: number;
  setBottomTabBarHeight: (num: number) => void;
  setPlayerBottomBarHeight: (num: number) => void;
}

export const DEFAULT_PLAYER_BOTTOM_BAR_VISUAL_HEIGHT = 64;

export const RelistenPlayerBottomBarContext = React.createContext<
  RelistenPlayerBottomBarContextProps | undefined
>(undefined);

export const RelistenPlayerBottomBarProvider = ({ children }: PropsWithChildren<object>) => {
  const [bottomTabBarHeight, setBottomTabBarHeight] = useState<number | undefined>(undefined);
  const [playerBottomBarHeight, setPlayerBottomBarHeight] = useState(
    DEFAULT_PLAYER_BOTTOM_BAR_VISUAL_HEIGHT
  );

  return (
    <RelistenPlayerBottomBarContext.Provider
      value={{
        bottomTabBarHeight,
        playerBottomBarHeight,
        setBottomTabBarHeight,
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

const usePlayerBottomObstructionInsets = () => {
  const visualHeight = usePlayerBarVisualHeight();
  const placementBackend = usePlayerBarPlacementBackend();
  const placementOffset = usePlayerBarPlacementOffset();

  if (placementBackend === 'nativeTabsAccessory' || visualHeight <= 0) {
    return {
      contentBottomPadding: 0,
      scrollIndicatorBottomInset: 0,
    };
  }

  return {
    // Overlay mode renders the player as an absolute sibling. On iOS NativeTabs,
    // that sibling is offset above the tab bar, so the scroll content needs room
    // for the full player frame, while the indicator only needs the player height.
    contentBottomPadding: Platform.OS === 'ios' ? visualHeight + placementOffset : visualHeight,
    scrollIndicatorBottomInset: visualHeight,
  };
};

const getNumericBottomPadding = (contentContainerStyle?: StyleProp<ViewStyle>) => {
  const flattenedStyle = StyleSheet.flatten(contentContainerStyle);
  const bottomPadding =
    flattenedStyle?.paddingBottom ?? flattenedStyle?.paddingVertical ?? flattenedStyle?.padding;

  return typeof bottomPadding === 'number' ? bottomPadding : 0;
};

const withAdditionalBottomPadding = (
  contentContainerStyle: StyleProp<ViewStyle> | undefined,
  bottomInset: number
) => {
  const paddingBottom = getNumericBottomPadding(contentContainerStyle) + bottomInset;

  return [contentContainerStyle, { paddingBottom }];
};

export interface PlayerBottomScrollViewProps {
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollIndicatorInsets?: Insets;
}

export const usePlayerBottomScrollViewProps = ({
  contentContainerStyle,
  scrollIndicatorInsets,
}: PlayerBottomScrollViewProps = {}) => {
  const { contentBottomPadding, scrollIndicatorBottomInset } = usePlayerBottomObstructionInsets();

  if (contentBottomPadding <= 0 && scrollIndicatorBottomInset <= 0) {
    return {
      contentContainerStyle,
      scrollIndicatorInsets,
    };
  }

  return {
    contentContainerStyle:
      contentBottomPadding > 0
        ? withAdditionalBottomPadding(contentContainerStyle, contentBottomPadding)
        : contentContainerStyle,
    scrollIndicatorInsets: {
      ...scrollIndicatorInsets,
      bottom: Math.max(scrollIndicatorInsets?.bottom ?? 0, scrollIndicatorBottomInset),
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
  const { bottomTabBarHeight } = useRelistenPlayerBottomBarContext();

  return useCompatibleNativeTabsBottomInset({
    measuredAndroidBottomInset: bottomTabBarHeight,
  });
};
