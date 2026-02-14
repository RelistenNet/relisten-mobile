import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsDesktopLayout } from '@/relisten/util/layout';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlayerBottomBar, useIsPlayerBottomBarVisible } from './player_bottom_bar';
import { PlayerScreen } from './player_screen';
import { usePlayerSheetStateController } from './player_sheet_state';

const COLLAPSE_BUTTON_HIT_SLOP = 8;

export function PlayerSheetHost() {
  const { isExpanded, collapse } = usePlayerSheetStateController();
  const isDesktopLayout = useIsDesktopLayout();
  const isBottomBarVisible = useIsPlayerBottomBarVisible();
  const safeAreaInsets = useSafeAreaInsets();

  if (isDesktopLayout || !isBottomBarVisible) {
    return null;
  }

  // Two host UI states:
  // - collapsed: floating bottom card entrypoint during playback.
  // - expanded: full player surface mounted in tabs with collapse action.
  if (!isExpanded) {
    return <PlayerBottomBar />;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.expandedSurface, { paddingTop: safeAreaInsets.top }]}>
        <View style={styles.collapseButtonContainer}>
          <Pressable
            accessibilityLabel="Collapse player"
            accessibilityRole="button"
            hitSlop={COLLAPSE_BUTTON_HIT_SLOP}
            onPress={collapse}
            style={styles.collapseButton}
          >
            <MaterialCommunityIcons name="chevron-down" size={28} color="white" />
          </Pressable>
        </View>
        <PlayerScreen variant="embedded" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  expandedSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00141a',
  },
  collapseButtonContainer: {
    position: 'absolute',
    right: 8,
    top: 4,
    zIndex: 2,
  },
  collapseButton: {
    padding: 8,
  },
});
