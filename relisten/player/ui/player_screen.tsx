import { PlayerBackground } from '@/relisten/player/ui/player_background';
import { PlayerOverlayHeader } from '@/relisten/player/ui/player_overlay_header';
import { usePlayerPresentation } from '@/relisten/player/ui/player_presentation';
import { PlayerQueueSheet } from '@/relisten/player/ui/player_queue_sheet';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { router, useNavigation, usePathname } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler, InteractionManager, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type PlayerScreenVariant = 'modal' | 'embedded' | 'overlay';

type PlayerScreenProps = {
  onClose?: () => void;
  variant?: PlayerScreenVariant;
};

export function PlayerScreen({ onClose, variant = 'modal' }: PlayerScreenProps) {
  const navigation = useNavigation();
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

  const viewHistoryShow = useCallback(
    (entry: PlaybackHistoryEntry) => {
      const navigate = () =>
        pushShow({
          artist: entry.artist,
          showUuid: entry.show.uuid,
          sourceUuid: entry.source.uuid,
        });

      if (isOverlay) {
        closePresentedPlayer(navigate);
      } else if (variant === 'modal') {
        closePlayer();
        void InteractionManager.runAfterInteractions(navigate);
      } else {
        navigate();
      }
    },
    [closePlayer, closePresentedPlayer, isOverlay, pushShow, variant]
  );

  return (
    <View className="flex-1 bg-relisten-blue-950">
      <PlayerBackground />
      <SafeAreaView edges={isEmbedded || isOverlay ? ['top'] : []} style={{ flex: 1, zIndex: 10 }}>
        {isOverlay && <PlayerOverlayHeader interactive />}
        <PlayerQueueSheet
          isPresentedOverlay={isOverlay}
          onBeforeNavigate={closePlayer}
          onOpenHistory={openHistory}
          onViewHistoryShow={viewHistoryShow}
          visualizerActive={visualizerActive}
        />
      </SafeAreaView>
    </View>
  );
}
