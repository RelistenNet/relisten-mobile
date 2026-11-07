import { PlayerBackground } from '@/relisten/player/ui/player_background';
import { PlayerOverlayHeader } from '@/relisten/player/ui/player_overlay_header';
import { usePlayerPresentation } from '@/relisten/player/ui/player_presentation';
import { PlayerQueueTray } from '@/relisten/player/ui/player_queue_tray';
import { router, useNavigation, usePathname } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export type PlayerScreenVariant = 'modal' | 'embedded' | 'overlay';

type PlayerScreenProps = {
  onClose?: () => void;
  variant?: PlayerScreenVariant;
};

export function PlayerScreen({ onClose, variant = 'modal' }: PlayerScreenProps) {
  const navigation = useNavigation();
  const backdropProgress = useSharedValue(0);
  const isEmbedded = variant === 'embedded';
  const isOverlay = variant === 'overlay';
  const closePlayer = onClose ?? (() => navigation.goBack());
  const { closePlayer: closePresentedPlayer, isPresentationActive } = usePlayerPresentation();
  const pathname = usePathname();
  const isCoveredByRoute =
    pathname.startsWith('/relisten/audio-adjustments') ||
    pathname.startsWith('/relisten/player-history');
  const visualizerActive = (!isOverlay || isPresentationActive) && !isCoveredByRoute;

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
        <PlayerQueueTray
          onBeforeNavigate={navigateFromPlayer}
          onOpenHistory={openHistory}
          visualizerActive={visualizerActive}
          dismissOnPull={isOverlay && isPresentationActive && !isCoveredByRoute}
        />
      </SafeAreaView>
    </View>
  );
}
