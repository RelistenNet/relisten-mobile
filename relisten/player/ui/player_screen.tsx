import { PlayerBackground } from '@/relisten/player/ui/player_background';
import { PlayerOverlayHeader } from '@/relisten/player/ui/player_overlay_header';
import { usePlayerPresentation } from '@/relisten/player/ui/player_presentation';
import { PlayerQueueSheet } from '@/relisten/player/ui/player_queue_sheet';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { router, useNavigation, usePathname } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler, InteractionManager, Platform, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export type PlayerScreenVariant = 'modal' | 'embedded' | 'overlay';

type PlayerScreenProps = {
  onClose?: () => void;
  variant?: PlayerScreenVariant;
};

export function PlayerScreen({ onClose, variant = 'modal' }: PlayerScreenProps) {
  const navigation = useNavigation();
  const queueProgress = useSharedValue(0);
  const backdropProgress = useSharedValue(0);
  const isEmbedded = variant === 'embedded';
  const isOverlay = variant === 'overlay';
  const closePlayer = onClose ?? (() => navigation.goBack());
  const { closePlayer: closePresentedPlayer, isPresentationActive } = usePlayerPresentation();
  const pathname = usePathname();
  const { pushShow } = usePushShowRespectingUserSettings();
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
        void InteractionManager.runAfterInteractions(navigate);
      } else {
        navigate();
      }
    },
    [closePlayer, closePresentedPlayer, isOverlay, variant]
  );

  const viewHistoryShow = useCallback(
    (entry: PlaybackHistoryEntry) => {
      navigateFromPlayer(() =>
        pushShow({
          artist: entry.artist,
          showUuid: entry.show.uuid,
          sourceUuid: entry.source.uuid,
        })
      );
    },
    [navigateFromPlayer, pushShow]
  );

  return (
    <View className="flex-1 bg-relisten-blue-950">
      <PlayerBackground backdropProgress={backdropProgress} />
      <SafeAreaView edges={isEmbedded || isOverlay ? ['top'] : []} style={{ flex: 1, zIndex: 10 }}>
        {isOverlay && <PlayerOverlayHeader interactive />}
        <PlayerQueueSheet
          backdropProgress={backdropProgress}
          queueProgress={queueProgress}
          isPresentedOverlay={isOverlay}
          onBeforeNavigate={navigateFromPlayer}
          onOpenHistory={openHistory}
          onViewHistoryShow={viewHistoryShow}
          visualizerActive={visualizerActive}
        />
      </SafeAreaView>
    </View>
  );
}
