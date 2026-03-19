import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Expo Router native tabs do not expose a runtime tab-bar height API in the current SDK.
// Keep these platform defaults only for compact-player anchoring until the player bar
// is redesigned around a different native-tabs integration seam.
const IOS_NATIVE_TAB_BAR_HEIGHT = 49;
const ANDROID_NATIVE_TAB_BAR_HEIGHT = 56;

export function useNativeTabsBottomInset() {
  const insets = useSafeAreaInsets();
  const [stableIosBottomInset, setStableIosBottomInset] = useState(insets.bottom);

  useEffect(() => {
    if (Platform.OS === 'ios' && insets.bottom > 0 && insets.bottom !== stableIosBottomInset) {
      setStableIosBottomInset(insets.bottom);
    }
  }, [insets.bottom, stableIosBottomInset]);

  if (Platform.OS === 'ios') {
    const effectiveIosBottomInset = insets.bottom > 0 ? insets.bottom : stableIosBottomInset;

    return IOS_NATIVE_TAB_BAR_HEIGHT + effectiveIosBottomInset;
  }

  if (Platform.OS === 'android') {
    return ANDROID_NATIVE_TAB_BAR_HEIGHT;
  }

  return 0;
}
