import { PlayerHeaderToolbar } from '@/relisten/player/ui/player_actions_menu';
import { PlayerBackground } from '@/relisten/player/ui/player_background';
import { PlayerHistoryView } from '@/relisten/player/ui/player_history_view';
import { PlayerOverlayHeader } from '@/relisten/player/ui/player_overlay_header';
import { PLAYER_PANEL_ROW_BACKGROUND } from '@/relisten/player/ui/player_panel_theme';
import { usePlayerPresentation } from '@/relisten/player/ui/player_presentation';
import { PlayerQueueSheet } from '@/relisten/player/ui/player_queue_sheet';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { Stack, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  InteractionManager,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export type PlayerScreenVariant = 'modal' | 'embedded' | 'overlay';

type PlayerScreenProps = {
  onClose?: () => void;
  variant?: PlayerScreenVariant;
};

export function PlayerScreen({ onClose, variant = 'modal' }: PlayerScreenProps) {
  'use no memo';

  const navigation = useNavigation();
  const isEmbedded = variant === 'embedded';
  const isOverlay = variant === 'overlay';
  const usesTransparentHeader = variant === 'modal' && Platform.OS === 'ios';
  const closePlayer = onClose ?? (() => navigation.goBack());
  const { closePlayer: closePresentedPlayer } = usePlayerPresentation();
  const { pushShow } = usePushShowRespectingUserSettings();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const historyProgress = useSharedValue(0);
  const [historyMounted, setHistoryMounted] = useState(false);
  const [queueHeaderActive, setQueueHeaderActive] = useState(false);
  const [view, setView] = useState<'timeline' | 'history'>('timeline');

  const openHistory = useCallback(() => {
    setHistoryMounted(true);
    setView('history');
    historyProgress.value = withTiming(1, {
      duration: reduceMotion ? 100 : 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [historyProgress, reduceMotion]);

  const closeHistory = useCallback(() => {
    setView('timeline');
    historyProgress.value = withTiming(
      0,
      { duration: reduceMotion ? 100 : 260, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(setHistoryMounted)(false);
      }
    );
  }, [historyProgress, reduceMotion]);

  const timelineStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 - historyProgress.value : 1 - historyProgress.value * 0.16,
    transform: [{ translateX: reduceMotion ? 0 : historyProgress.value * width * -0.18 }],
  }));
  const historyStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? historyProgress.value : 1,
    transform: [{ translateX: reduceMotion ? 0 : (1 - historyProgress.value) * width }],
  }));

  useEffect(() => {
    if (Platform.OS !== 'android' || (!isOverlay && view !== 'history')) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view === 'history') {
        closeHistory();
      } else {
        closePlayer();
      }
      return true;
    });

    return () => subscription.remove();
  }, [closeHistory, closePlayer, isOverlay, view]);

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
    <>
      {variant === 'modal' && (
        <>
          <Stack.Screen
            options={{
              title:
                view === 'history'
                  ? 'Listening History'
                  : queueHeaderActive
                    ? 'Queue'
                    : 'Now Playing',
              contentStyle: { backgroundColor: 'transparent' },
              headerStyle: {
                backgroundColor: usesTransparentHeader ? 'transparent' : RelistenBlue['950'],
              },
              headerShadowVisible: false,
              headerTintColor: 'white',
              headerTitleStyle: { fontSize: 18, fontWeight: '600' },
              headerTransparent: usesTransparentHeader,
            }}
          />
          <PlayerHeaderToolbar mode={view} onBack={closeHistory} onClose={closePlayer} />
        </>
      )}
      <View className="flex-1 bg-relisten-blue-950">
        <PlayerBackground />
        <SafeAreaView
          className="flex-1"
          edges={isEmbedded || isOverlay ? ['top'] : []}
          style={{ zIndex: 1 }}
        >
          {isOverlay && (
            <PlayerOverlayHeader
              mode={view}
              onBack={closeHistory}
              onClose={closePlayer}
              queueActive={queueHeaderActive}
            />
          )}
          <View style={{ flex: 1 }}>
            <Animated.View
              pointerEvents={view === 'timeline' ? 'auto' : 'none'}
              style={[StyleSheet.absoluteFill, timelineStyle]}
            >
              <PlayerQueueSheet
                isPresentedOverlay={isOverlay}
                onOpenHistory={openHistory}
                onQueueHeaderActiveChange={setQueueHeaderActive}
                onViewHistoryShow={viewHistoryShow}
                usesTransparentHeader={usesTransparentHeader}
              />
            </Animated.View>
            {historyMounted && (
              <Animated.View
                pointerEvents={view === 'history' ? 'auto' : 'none'}
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: PLAYER_PANEL_ROW_BACKGROUND,
                    boxShadow: '-10px 0 26px rgba(0, 0, 0, 0.28)',
                  },
                  historyStyle,
                ]}
              >
                <PlayerHistoryView onViewShow={viewHistoryShow} />
              </Animated.View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </>
  );
}
