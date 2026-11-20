import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { subscribeToToasts, type Toast, type ToastTone } from '@/relisten/components/toast';
import {
  usePlayerBarPlacementOffset,
  usePlayerBarVisualHeight,
} from '@/relisten/player/ui/player_bar_layout';
import { usePlayerPresentation } from '@/relisten/player/ui/player_presentation';
import { RelistenBlue } from '@/relisten/relisten_blue';

const VISIBLE_MS = 3_500;
const VISIBLE_WITH_ACTIONS_MS = 6_000;
const VISIBLE_ERROR_MS = 8_000;
/** How far the toast rises as it appears; small, so it settles rather than flies in. */
const RISE = 8;
const APPEAR_MS = 160;
const LEAVE_MS = 140;
const DISMISS_DISTANCE = 16;
/** The gap between the toast and the player, or the bottom of the screen. */
const GAP = 20;

const TONE_BORDER: Record<ToastTone, string> = {
  info: 'rgba(255, 255, 255, 0.22)',
  warning: 'rgba(229, 192, 123, 0.55)',
  error: 'rgba(240, 113, 120, 0.6)',
};

/** Shows `showToast`'s toasts, just above the player. Mounted once, at the app root. */
export function ToastHost() {
  const [toast, setToast] = useState<Toast | null>(null);
  const bottom = useToastBottom();
  // 0 is shown; RISE is hidden below its resting place.
  const offset = useSharedValue(RISE);
  const opacity = useSharedValue(0);
  const handled = useRef(0);

  function dismiss() {
    offset.set(withTiming(RISE, { duration: LEAVE_MS }));
    opacity.set(
      withTiming(0, { duration: LEAVE_MS }, (finished) => {
        if (finished) {
          runOnJS(setToast)(null);
        }
      })
    );
  }

  useEffect(() => subscribeToToasts((next) => (next ? setToast(next) : dismiss())), []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    offset.set(RISE);
    opacity.set(0);
    offset.set(withTiming(0, { duration: APPEAR_MS }));
    opacity.set(withTiming(1, { duration: APPEAR_MS }));
    AccessibilityInfo.announceForAccessibility(toast.message);

    // A screen reader needs time to reach the toast's actions.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((screenReader) => {
      if (cancelled) {
        return;
      }
      const visibleMs =
        toast.tone === 'error'
          ? VISIBLE_ERROR_MS
          : toast.actions.length > 0
            ? VISIBLE_WITH_ACTIONS_MS
            : VISIBLE_MS;
      timer = setTimeout(() => dismiss(), screenReader ? visibleMs * 3 : visibleMs);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [toast]);

  const swipeDown = Gesture.Pan()
    .onUpdate((event) => {
      offset.set(Math.max(0, event.translationY));
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > 500) {
        runOnJS(dismiss)();
      } else {
        offset.set(withTiming(0, { duration: APPEAR_MS }));
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
    opacity: opacity.get(),
  }));

  if (!toast) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom, zIndex: 2001, elevation: 2001 }}
    >
      <GestureDetector gesture={swipeDown}>
        <Animated.View
          accessibilityLiveRegion="polite"
          className="mx-4 flex-row items-center rounded-2xl px-4 py-2.5"
          style={[
            {
              alignSelf: 'center',
              backgroundColor: RelistenBlue[800],
              borderColor: TONE_BORDER[toast.tone],
              borderWidth: 1,
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.4)',
              maxWidth: 560,
            },
            animatedStyle,
          ]}
        >
          <RelistenText className="shrink text-[15px] leading-5" numberOfLines={3}>
            {toast.message}
          </RelistenText>
          {toast.actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              className="ml-4"
              onPress={() => {
                // A toast's actions run at most once, even if tapped again while it leaves.
                if (handled.current === toast.id) {
                  return;
                }
                handled.current = toast.id;
                dismiss();
                action.onPress();
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <RelistenText
                className="text-[15px] font-semibold"
                numberOfLines={1}
                selectable={false}
                style={{ color: RelistenBlue[300] }}
              >
                {action.label}
              </RelistenText>
            </Pressable>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * Where the toast rests: just above the player bar and the tabs below it, or
 * just above the bottom of the screen while the full player is open or no
 * player shows.
 */
function useToastBottom(): number {
  const insets = useSafeAreaInsets();
  const placementOffset = usePlayerBarPlacementOffset();
  const playerBarHeight = usePlayerBarVisualHeight();
  const { isPresentationActive } = usePlayerPresentation();

  if (isPresentationActive) {
    return insets.bottom + GAP;
  }
  return Math.max(placementOffset + playerBarHeight, insets.bottom) + GAP;
}
