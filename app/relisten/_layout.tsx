import { PlayerScreen } from '@/relisten/player/ui/player_screen';
import { useIsPlayerInspectorVisible } from '@/relisten/player/ui/player_bar_layout';
import { setPlayerInspectorOpen } from '@/relisten/player/ui/player_inspector';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { RelistenNavigationProvider } from '@/relisten/util/routes';
import { SplitView } from 'expo-router/unstable-split-view';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';

/**
 * The app inside a native split view. Its main column is the tabs and the
 * screens presented over them; in a wide window the player sits in the
 * trailing inspector column. Narrow windows and iPhone show only the main
 * column, where the mini player and full-screen player work as before.
 * Android has no split view and renders the main column alone.
 */
export default function RelistenSplitLayout() {
  const showInspector = useIsPlayerInspectorVisible();
  // UIKit also reports a hide when this layout stops showing the inspector
  // (the window narrowed, or the queue emptied). Only a hide the listener
  // made should close it for when the window widens again.
  const inspectorShownByLayout = useRef(showInspector);

  useLayoutEffect(() => {
    inspectorShownByLayout.current = showInspector;
  }, [showInspector]);

  const onInspectorHide = useCallback(() => {
    if (inspectorShownByLayout.current) {
      setPlayerInspectorOpen(false);
    }
  }, []);

  return (
    <SplitView
      // UIKit has no split view without a sidebar column, so this keeps an
      // empty one permanently hidden: no toggle button, no swipe to reveal,
      // and a collapsed split (iPhone, narrow windows) shows the main column.
      preferredDisplayMode="secondaryOnly"
      displayModeButtonVisibility="never"
      presentsWithGesture={false}
      topColumnForCollapsing="secondary"
      showInspector={showInspector}
      onInspectorHide={onInspectorHide}
      columnMetrics={{
        minimumInspectorColumnWidth: 320,
        preferredInspectorColumnWidthOrFraction: 360,
        maximumInspectorColumnWidth: 420,
      }}
    >
      <SplitView.Column>
        <View />
      </SplitView.Column>
      <SplitView.Inspector>
        <PlayerInspector />
      </SplitView.Inspector>
    </SplitView>
  );
}

function PlayerInspector() {
  const hideInspector = useCallback(() => setPlayerInspectorOpen(false), []);

  return (
    <View style={{ flex: 1, backgroundColor: RelistenBlue['950'] }}>
      {/* Menus in the player navigate into the Artists tab, as the full-screen player does. */}
      <RelistenNavigationProvider groupSegment="(artists)">
        <PlayerScreen onClose={hideInspector} variant="embedded" />
      </RelistenNavigationProvider>
    </View>
  );
}
