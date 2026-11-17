import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RelistenText } from '@/relisten/components/relisten_text';
import Realm from 'realm';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { undoLastEdit } from '@/relisten/playlists/playlist_actions';
import type { PlaylistRowEntry, PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';

export interface PlaylistToastAction {
  label: string;
  onPress: () => void;
}

interface PlaylistToast {
  id: number;
  message: string;
  actions: PlaylistToastAction[];
}

// One toast at a time: a new one replaces the current one. The host mounted at
// the app root subscribes here, so any screen or sheet can show a toast.
let nextToastId = 1;
let listener: ((toast: PlaylistToast | null) => void) | null = null;

/**
 * A small confirmation after a playlist edit, with text actions such as Undo.
 * It sits under the status bar, above the player, and leaves on its own, on an
 * upward swipe, or when an action is chosen.
 */
export function showPlaylistToast(message: string, actions: PlaylistToastAction[] = []) {
  listener?.({ id: nextToastId++, message, actions });
}

const VISIBLE_MS = 3_500;
const VISIBLE_WITH_ACTIONS_MS = 6_000;
const DISMISS_DISTANCE = 24;

export function PlaylistToastHost() {
  const [toast, setToast] = useState<PlaylistToast | null>(null);
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(-120);

  useEffect(() => {
    listener = setToast;
    return () => {
      listener = null;
    };
  }, []);

  function dismiss() {
    offset.set(
      withTiming(-120, { duration: 180 }, (finished) => {
        if (finished) {
          runOnJS(setToast)(null);
        }
      })
    );
  }

  useEffect(() => {
    if (!toast) {
      return;
    }
    offset.set(withSpring(0, { damping: 20, stiffness: 220 }));
    const timer = setTimeout(
      () => dismiss(),
      toast.actions.length > 0 ? VISIBLE_WITH_ACTIONS_MS : VISIBLE_MS
    );
    return () => clearTimeout(timer);
  }, [toast]);

  const swipeUp = Gesture.Pan()
    .onUpdate((event) => {
      offset.set(Math.min(0, event.translationY));
    })
    .onEnd((event) => {
      if (event.translationY < -DISMISS_DISTANCE || event.velocityY < -500) {
        runOnJS(dismiss)();
      } else {
        offset.set(withSpring(0));
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
    opacity: 1 + offset.get() / 120,
  }));

  if (!toast) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 4, zIndex: 2001 }}
    >
      <GestureDetector gesture={swipeUp}>
        <Animated.View
          accessibilityLiveRegion="polite"
          className="mx-4 flex-row items-center rounded-2xl px-4 py-2.5"
          style={[
            {
              alignSelf: 'center',
              backgroundColor: RelistenBlue[900],
              borderColor: 'rgba(255, 255, 255, 0.12)',
              borderWidth: 1,
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.4)',
              maxWidth: 560,
            },
            animatedStyle,
          ]}
        >
          <RelistenText className="shrink text-[15px] leading-5" numberOfLines={2}>
            {toast.message}
          </RelistenText>
          {toast.actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              className="ml-4"
              onPress={() => {
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

/** The Undo button for an edit toast. An account edit can be undone only until it is sent. */
export function undoAction(realm: Realm, playlistId: string): PlaylistToastAction {
  return {
    label: 'Undo',
    onPress: () => {
      if (!undoLastEdit(realm, playlistId)) {
        showPlaylistToast('That change is already saved to your account, so it can’t be undone.');
      }
    },
  };
}

/** Confirms an edit with Undo. An edit that changed nothing gets no toast. */
export function toastEdit(
  realm: Realm,
  playlistId: string,
  changed: boolean,
  message: string,
  extra: PlaylistToastAction[] = []
) {
  if (changed) {
    showPlaylistToast(message, [undoAction(realm, playlistId), ...extra]);
  }
}

/** "Removed Jack Straw", noting when its one linked partner is left on its own. */
export function removedMessage(row: PlaylistRowEntry, group: PlaylistRowGroup): string {
  const title = row.sourceTrack?.title ?? 'track';
  const mate = group.entries.length === 2 ? group.entries.find((r) => r !== row) : undefined;
  return mate
    ? `Removed ${title}. ${mate.sourceTrack?.title ?? 'The other track'} is no longer linked.`
    : `Removed ${title}`;
}
