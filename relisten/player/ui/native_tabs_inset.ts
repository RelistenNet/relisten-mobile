import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Expo Router native tabs do not expose a runtime tab-bar height API in the current SDK.
// Keep these platform defaults isolated as a compatibility helper for the shared
// player-bar layout contract rather than spreading them across screens.
const IOS_NATIVE_TAB_BAR_HEIGHT = 49;
const ANDROID_NATIVE_TAB_BAR_HEIGHT = 56;

export const getCompatibleNativeTabsBottomInset = ({
  platformOs,
  insetBottom,
  stableIosBottomInset,
}: {
  platformOs: typeof Platform.OS;
  insetBottom: number;
  stableIosBottomInset: number;
}) => {
  if (platformOs === 'ios') {
    const effectiveIosBottomInset = insetBottom > 0 ? insetBottom : stableIosBottomInset;

    return IOS_NATIVE_TAB_BAR_HEIGHT + effectiveIosBottomInset;
  }

  if (platformOs === 'android') {
    return ANDROID_NATIVE_TAB_BAR_HEIGHT;
  }

  return 0;
};

export function useCompatibleNativeTabsBottomInset() {
  const insets = useSafeAreaInsets();
  const [stableIosBottomInset, setStableIosBottomInset] = useState(insets.bottom);

  useEffect(() => {
    if (Platform.OS === 'ios' && insets.bottom > 0 && insets.bottom !== stableIosBottomInset) {
      setStableIosBottomInset(insets.bottom);
    }
  }, [insets.bottom, stableIosBottomInset]);

  return getCompatibleNativeTabsBottomInset({
    platformOs: Platform.OS,
    insetBottom: insets.bottom,
    stableIosBottomInset,
  });
}

export const useNativeTabsBottomInset = useCompatibleNativeTabsBottomInset;
