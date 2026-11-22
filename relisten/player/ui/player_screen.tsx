import { PlayerBackground } from '@/relisten/player/ui/player_background';
import { usePlayerCoveredByRoute } from '@/relisten/player/ui/player_covering_route';
import { PlayerOverlayHeader } from '@/relisten/player/ui/player_overlay_header';
import { usePlayerPresentation } from '@/relisten/player/ui/player_presentation';
import { PlayerQueueTray } from '@/relisten/player/ui/player_queue_tray';
import { TrackNavigationProvider } from '@/relisten/player/ui/track_navigation';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BackHandler, Platform, TouchableOpacity, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export type PlayerScreenVariant = 'modal' | 'embedded' | 'overlay';

type PlayerScreenProps = {
  onClose?: () => void;
  variant?: PlayerScreenVariant;
  /** False while a mounted player is out of sight, as the hidden rail is. */
  visible?: boolean;
};

/** The rail's own way out; the mini player brings it back. */
function PlayerRailHeader({ onHide }: { onHide: () => void }) {
  return (
    <View className="h-12 flex-row items-center justify-end px-2">
      <TouchableOpacity
        accessibilityLabel="Hide player"
        accessibilityRole="button"
        className="h-11 w-11 items-center justify-center"
        onPress={onHide}
      >
        <MaterialCommunityIcons color="rgba(255, 255, 255, 0.8)" name="dock-right" size={22} />
      </TouchableOpacity>
    </View>
  );
}

export function PlayerScreen({ onClose, variant = 'modal', visible = true }: PlayerScreenProps) {
  const navigation = useNavigation();
  const backdropProgress = useSharedValue(0);
  const isEmbedded = variant === 'embedded';
  const isOverlay = variant === 'overlay';
  const closePlayer = onClose ?? (() => navigation.goBack());
  const { closePlayer: closePresentedPlayer, isPresentationActive } = usePlayerPresentation();
  const isCoveredByRoute = usePlayerCoveredByRoute();
  const visualizerActive = visible && (!isOverlay || isPresentationActive) && !isCoveredByRoute;

  const openHistory = useCallback(() => {
    router.push('/relisten/player-history');
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isOverlay || isCoveredByRoute) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closePlayer();
      return true;
    });

    return () => subscription.remove();
  }, [closePlayer, isCoveredByRoute, isOverlay]);

  const navigateFromPlayer = useCallback(
    (navigate: () => void) => {
      if (isOverlay) {
        closePresentedPlayer(navigate);
      } else if (variant === 'modal') {
        closePlayer();
        requestIdleCallback(navigate);
      } else {
        navigate();
      }
    },
    [closePlayer, closePresentedPlayer, isOverlay, variant]
  );

  return (
    <View className="flex-1 bg-relisten-blue-950">
      <PlayerBackground backdropProgress={backdropProgress} />
      <SafeAreaView edges={isEmbedded || isOverlay ? ['top'] : []} style={{ flex: 1, zIndex: 10 }}>
        {isOverlay && <PlayerOverlayHeader interactive />}
        {isEmbedded && onClose && <PlayerRailHeader onHide={onClose} />}
        {/* Every menu in the player closes it before navigating. */}
        <TrackNavigationProvider beforeNavigate={navigateFromPlayer}>
          <PlayerQueueTray
            onOpenHistory={openHistory}
            visualizerActive={visualizerActive}
            dismissOnPull={isOverlay && isPresentationActive && !isCoveredByRoute}
          />
        </TrackNavigationProvider>
      </SafeAreaView>
    </View>
  );
}
