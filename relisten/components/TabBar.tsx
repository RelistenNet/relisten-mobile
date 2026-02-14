import { BottomTabBar, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useCallback, useEffect } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import {
  LEGACY_TAB_INSET_REPORTER,
  useTabInsetAdapter,
} from '@/relisten/player/ui/tab_inset_adapter';

export default function TabBar(props: BottomTabBarProps) {
  const { clearInset, reportInset } = useTabInsetAdapter();
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      reportInset({
        sourceId: LEGACY_TAB_INSET_REPORTER.tabBar,
        bottomInset: event.nativeEvent.layout.height,
      });
    },
    [reportInset]
  );

  useEffect(() => {
    return () => {
      clearInset(LEGACY_TAB_INSET_REPORTER.tabBar);
    };
  }, [clearInset]);

  return (
    <View onLayout={onLayout}>
      <BottomTabBar {...props} />
    </View>
  );
}
