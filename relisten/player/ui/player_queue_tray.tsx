import { RelistenText } from '@/relisten/components/relisten_text';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { type PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import { MaterialIcons } from '@expo/vector-icons';
import BottomSheet, {
  ANIMATION_STATUS,
  SCROLLABLE_STATUS,
  BottomSheetBackdrop,
  useBottomSheetGestureHandlers,
  useBottomSheetInternal,
  useScrollEventsHandlersDefault,
  type ScrollEventsHandlersHookType,
  useBottomSheetScrollableCreator,
  type BottomSheetBackgroundProps,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import DraggableFlatList, { type RenderItem } from 'react-native-draggable-flatlist';
import Animated, {
  runOnJS,
  scrollTo,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { usePlayerDismissGesture } from './use_player_dismiss_gesture';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playerDisplayTitle } from './player_display_helpers';
import { PlayerNowPlaying } from './player_now_playing';
import { usePlayerPresentation } from './player_presentation';
import { isQueueReorderCurrent } from './player_queue_reorder';
import { PlayerQueueTrayRow } from './player_queue_tray_row';
import { usePlayerQueueAnchor } from './player_queue_anchor';

type QueueScrollTransition = {
  fromIndex: number;
  toIndex: number;
  fromOffset: number;
  toOffset: number;
};

const QueueScrollContext = createContext<{
  offset: SharedValue<number>;
  transition: SharedValue<QueueScrollTransition | null>;
  onSnap: (index: number) => void;
  onViewportHeightChange: (height: number) => void;
  expanded: boolean;
  subtitle: string;
  onToggle: () => void;
} | null>(null);

// The peek deliberately starts at the next track, rather than content offset zero.
// Preserve that anchor while snapping; retain Gorhom's normal body-scroll handoff
// while the user is dragging the expanded queue.
const useQueueScrollEvents: ScrollEventsHandlersHookType = (ref, offset) => {
  const defaults = useScrollEventsHandlersDefault(ref, offset);
  // Gorhom supplies useAnimatedRef here, but its public hook type erases that detail.
  const animatedRef = ref as Parameters<typeof scrollTo>[0];
  const {
    offset: queueOffset,
    transition,
    onSnap,
    onViewportHeightChange,
  } = useContext(QueueScrollContext)!;
  const {
    animatedIndex,
    animatedAnimationState,
    animatedScrollableState,
    animatedScrollableStatus,
    animatedSheetHeight,
    animatedLayoutState,
  } = useBottomSheetInternal();
  // Use the final viewport geometry, not each intermediate height of the animated mask.
  useAnimatedReaction(
    () => {
      const handleHeight = animatedLayoutState.get().handleHeight;
      return handleHeight < 0 ? 0 : Math.max(0, animatedSheetHeight.get() - handleHeight);
    },
    (height, previous) => {
      if (height !== previous) runOnJS(onViewportHeightChange)(height);
    }
  );
  // Read the actual native animation target, including a reversal to the same
  // detent (for which Gorhom intentionally omits onAnimate/onChange callbacks).
  useAnimatedReaction(
    () => {
      const animation = animatedAnimationState.get();
      if (animation.status === ANIMATION_STATUS.RUNNING) return animation.nextIndex ?? -1;
      return animatedIndex.value === 0 || animatedIndex.value === 1 ? animatedIndex.value : -1;
    },
    (index, previous) => {
      if (index >= 0 && index !== previous) runOnJS(onSnap)(index);
    }
  );
  // One clock: derive the list's scroll offset from the sheet's actual progress.
  useAnimatedReaction(
    () => ({
      index: animatedIndex.value,
      motion: transition.value,
      animating: animatedAnimationState.get().status === ANIMATION_STATUS.RUNNING,
    }),
    ({ index, motion, animating }) => {
      if (!motion) return;
      if (!animating) {
        if (index === motion.toIndex) scrollTo(animatedRef, 0, motion.toOffset, false);
        transition.set(null);
        return;
      }
      const progress = Math.max(
        0,
        Math.min(1, (index - motion.fromIndex) / (motion.toIndex - motion.fromIndex))
      );
      scrollTo(
        animatedRef,
        0,
        motion.fromOffset + (motion.toOffset - motion.fromOffset) * progress,
        false
      );
    }
  );
  const preserveAnchor = () => {
    'worklet';
    return (
      animatedIndex.value === 0 ||
      animatedAnimationState.get().status === ANIMATION_STATUS.RUNNING ||
      // The index can settle before Gorhom's derived scroll lock unlocks.
      // Preserve the anchor through that last frame instead of locking to zero.
      (animatedIndex.value === 1 && animatedScrollableStatus.value === SCROLLABLE_STATUS.LOCKED)
    );
  };
  const recordOffset = (y: number) => {
    'worklet';
    offset.set(y);
    animatedScrollableState.modify((state) => ({ ...state, contentOffsetY: y }));
  };
  return {
    ...defaults,
    handleOnScroll: (event, context) => {
      'worklet';
      queueOffset.set(event.contentOffset.y);
      if (preserveAnchor()) recordOffset(event.contentOffset.y);
      else defaults.handleOnScroll?.(event, context);
    },
    handleOnEndDrag: (event, context) => {
      'worklet';
      queueOffset.set(event.contentOffset.y);
      if (preserveAnchor()) recordOffset(event.contentOffset.y);
      else defaults.handleOnEndDrag?.(event, context);
    },
    handleOnMomentumEnd: (event, context) => {
      'worklet';
      queueOffset.set(event.contentOffset.y);
      if (preserveAnchor()) recordOffset(event.contentOffset.y);
      else defaults.handleOnMomentumEnd?.(event, context);
    },
  };
};

// Gorhom takes a hook as configuration. Keep that compiler exception local so
// the player and its row callbacks still benefit from React Compiler memoization.
function useQueueScrollComponent() {
  'use no memo';
  // eslint-disable-next-line react-compiler/react-compiler -- Gorhom takes a hook as configuration.
  return useBottomSheetScrollableCreator({ scrollEventsHandlersHook: useQueueScrollEvents });
}

function QueueTrayHandle() {
  const { expanded, subtitle, onToggle } = useContext(QueueScrollContext)!;
  const title = expanded ? 'Queue' : 'Up next';
  return (
    <View className="pb-2">
      <View className="items-center py-2">
        <View className="h-1 w-9 rounded-full bg-white/30" />
      </View>
      <View className="min-h-[56px] flex-row items-center px-4">
        <View className="min-w-0 flex-1 justify-center">
          <RelistenText
            accessibilityRole="header"
            className="text-lg font-semibold"
            selectable={false}
          >
            {title}
          </RelistenText>
          <RelistenText className="mt-0.5 text-sm text-gray-300" selectable={false}>
            {subtitle}
          </RelistenText>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${subtitle}`}
          accessibilityHint={expanded ? 'Collapses the queue tray.' : 'Expands the queue tray.'}
          accessibilityState={{ expanded }}
          activeOpacity={0.7}
          onPress={onToggle}
          className="h-11 w-11 items-center justify-center"
        >
          <MaterialIcons
            name={expanded ? 'keyboard-arrow-down' : 'keyboard-arrow-up'}
            size={24}
            color="rgba(255,255,255,0.62)"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TrayBackground({ style }: BottomSheetBackgroundProps) {
  return (
    <View
      pointerEvents="none"
      style={[style, { backgroundColor: '#123039', borderRadius: 28, overflow: 'hidden' }]}
    >
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(0, 29, 36, 0.65)',
            borderRadius: 28,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
          },
        ]}
      />
    </View>
  );
}

// The peek supports both tapping and dragging without a native touchable claiming the pan.
function QueuePeekGesture({ onOpen, label }: { onOpen: () => void; label: string }) {
  const { handlePanGestureHandler: handler } = useBottomSheetGestureHandlers();
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetY([-8, 8])
      .onStart(handler.handleOnStart)
      .onChange(handler.handleOnChange)
      .onEnd(handler.handleOnEnd)
      .onFinalize(handler.handleOnFinalize);
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((_event, success) => {
        if (success) onOpen();
      });
    return Gesture.Exclusive(pan, tap);
  }, [handler, onOpen]);
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        onAccessibilityTap={onOpen}
        style={StyleSheet.absoluteFill}
      />
    </GestureDetector>
  );
}

export function PlayerQueueTray({
  onBeforeNavigate,
  onOpenHistory,
  visualizerActive,
  dismissOnPull,
}: {
  onBeforeNavigate: (navigate: () => void) => void;
  onOpenHistory: () => void;
  visualizerActive: boolean;
  dismissOnPull: boolean;
}) {
  const player = useRelistenPlayer();
  const tracks = useRelistenPlayerQueueOrderedTracks();
  const renderQueueScrollComponent = useQueueScrollComponent();
  // The hook retains this array until a queue update, so rows never scan the queue.
  const showArtist = useMemo(() => {
    const firstArtistUuid = tracks[0]?.sourceTrack.artistUuid;
    return tracks.some((track) => track.sourceTrack.artistUuid !== firstArtistUuid);
  }, [tracks]);
  const current = useRelistenPlayerCurrentTrack();
  const currentIndex = tracks.findIndex((track) => track.identifier === current?.identifier);
  const nextIndex = Math.max(0, currentIndex + 1);
  const next = tracks[nextIndex]?.sourceTrack;
  const remaining = Math.max(0, tracks.length - nextIndex);
  const subtitle = current
    ? `${remaining} ${remaining === 1 ? 'track' : 'tracks'} remaining`
    : `${tracks.length} queued ${tracks.length === 1 ? 'track' : 'tracks'}`;
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const [{ height, width }, setSize] = useState({ height: 0, width: 0 });
  const [expanded, setExpanded] = useState(false);
  const trayExpanded = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [listHeight, setListHeight] = useState(0);
  const rowHeights = useRef(new Map<string, number>());
  const [bottomSpace, setBottomSpace] = useState(insets.bottom + 12);
  const footerFrame = useRef<ReturnType<typeof requestAnimationFrame> | undefined>(undefined);
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<FlatList<PlayerQueueTrack>>(null);
  const dragKeys = useRef<readonly string[] | null>(null);
  const anchor = usePlayerQueueAnchor(listRef);
  const currentRowRef = useRef<ViewInstance>(null);
  const nextRowRef = useRef<ViewInstance>(null);
  const { markPlayerContentReady, isPresentationActive } = usePlayerPresentation();
  const sheetIndex = useSharedValue(0);
  const queueOffset = useSharedValue(0);
  const queueTransition = useSharedValue<QueueScrollTransition | null>(null);
  const mainOffset = useSharedValue(0);
  const dismissGesture = usePlayerDismissGesture(dismissOnPull && !expanded, mainOffset);
  const scrollGesture = Gesture.Native().requireExternalGestureToFail(dismissGesture);
  const onMainScroll = useAnimatedScrollHandler((event) => {
    mainOffset.set(event.contentOffset.y);
  });
  const basePeekHeight = Math.min(172 + insets.bottom, Math.max(140, height * 0.24));
  const peekHeight = Math.min(height * 0.6, basePeekHeight * Math.max(1, fontScale));
  const snapPoints = useMemo(
    () => [peekHeight, Math.max(peekHeight + 100, height * 0.92)],
    [height, peekHeight]
  );
  const queueKeys = tracks.map((track) => track.identifier);

  useEffect(() => {
    if (height > 0 && isPresentationActive) markPlayerContentReady();
  }, [height, isPresentationActive, markPlayerContentReady]);
  useEffect(() => {
    if (dragging && !isQueueReorderCurrent(dragKeys.current, queueKeys)) {
      dragKeys.current = null;
      setDragging(false);
    }
  }, [dragging, queueKeys]);

  const recalculateFooter = useCallback(() => {
    const minimum = insets.bottom + 12;
    let tailHeight = 0;
    const first = trayExpanded.current ? Math.max(0, currentIndex) : nextIndex;
    for (
      let index = first;
      index < tracks.length && tailHeight < listHeight - minimum;
      index += 1
    ) {
      tailHeight += rowHeights.current.get(tracks[index].identifier) ?? (showArtist ? 64 : 48);
    }
    setBottomSpace(Math.max(minimum, listHeight - tailHeight));
  }, [currentIndex, nextIndex, tracks, listHeight, insets.bottom, showArtist]);
  const updateFooter = useRef(recalculateFooter);
  useEffect(() => {
    updateFooter.current = recalculateFooter;
    recalculateFooter();
  }, [recalculateFooter]);
  useEffect(
    () => () => {
      anchor.cancel();
      if (footerFrame.current !== undefined) cancelAnimationFrame(footerFrame.current);
      footerFrame.current = undefined;
    },
    [anchor]
  );
  const measureRow = useCallback((identifier: string, height: number) => {
    if (rowHeights.current.get(identifier) === height) return;
    rowHeights.current.set(identifier, height);
    if (footerFrame.current !== undefined) return;
    footerFrame.current = requestAnimationFrame(() => {
      footerFrame.current = undefined;
      updateFooter.current();
    });
  }, []);
  const alignTrack = useCallback(
    (requestedIndex: number) => {
      const index = Math.max(0, requestedIndex);
      if (tracks[index]) anchor.start(index);
      else anchor.cancel();
    },
    [anchor, tracks]
  );
  useEffect(() => {
    if (!trayExpanded.current) alignTrack(nextIndex);
  }, [alignTrack, nextIndex]);
  const updateTrayPosition = useCallback(
    (index: number) => {
      const nextExpanded = index > 0;
      if (trayExpanded.current === nextExpanded) return;
      trayExpanded.current = nextExpanded;
      setExpanded(nextExpanded);
      recalculateFooter();
      const targetIndex = nextExpanded ? currentIndex : nextIndex;
      const targetRow = nextExpanded ? currentRowRef.current : nextRowRef.current;
      const scrollView = listRef.current?.getNativeScrollRef();
      queueTransition.set(null);
      anchor.cancel();
      if (!targetRow || !scrollView) {
        alignTrack(targetIndex);
        return;
      }
      targetRow.measureLayout(
        scrollView,
        (_x, targetOffset) => {
          if (trayExpanded.current !== nextExpanded) return;
          const fromIndex = sheetIndex.get();
          if (fromIndex !== index) {
            queueTransition.set({
              fromIndex,
              toIndex: index,
              fromOffset: queueOffset.get(),
              toOffset: targetOffset,
            });
          } else {
            listRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
          }
        },
        () => alignTrack(targetIndex)
      );
    },
    [
      alignTrack,
      currentIndex,
      nextIndex,
      queueOffset,
      queueTransition,
      sheetIndex,
      anchor,
      recalculateFooter,
    ]
  );
  const openQueue = useCallback(() => sheetRef.current?.snapToIndex(1), []);
  const toggleQueue = useCallback(
    () => sheetRef.current?.snapToIndex(trayExpanded.current ? 0 : 1),
    []
  );
  const nextIdentifier = tracks[nextIndex]?.identifier;
  const renderItem = useCallback<RenderItem<PlayerQueueTrack>>(
    ({ item, getIndex, drag }) => (
      <View
        ref={
          item.identifier === current?.identifier
            ? currentRowRef
            : item.identifier === nextIdentifier
              ? nextRowRef
              : undefined
        }
        onLayout={(event) => measureRow(item.identifier, event.nativeEvent.layout.height)}
      >
        <PlayerQueueTrayRow
          track={item}
          index={getIndex() ?? tracks.indexOf(item)}
          current={item.identifier === current?.identifier}
          showArtist={showArtist}
          drag={drag}
        />
      </View>
    ),
    [current?.identifier, nextIdentifier, measureRow, showArtist, tracks]
  );
  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={1}
        disappearsOnIndex={0}
        pressBehavior={0}
        opacity={0.4}
      />
    ),
    []
  );

  return (
    <View
      className="flex-1"
      onLayout={(e) => {
        const { height, width } = e.nativeEvent.layout;
        setSize({ height, width });
      }}
    >
      <GestureDetector gesture={dismissGesture}>
        <Animated.View style={{ flex: 1 }}>
          <GestureDetector gesture={scrollGesture}>
            <Animated.ScrollView
              showsVerticalScrollIndicator={false}
              contentInsetAdjustmentBehavior="never"
              contentContainerStyle={{ paddingBottom: peekHeight + 16 }}
              accessibilityElementsHidden={expanded}
              onScroll={onMainScroll}
              scrollEventThrottle={16}
              bounces
              alwaysBounceVertical
            >
              <View style={{ minHeight: Math.max(0, height - peekHeight - 16) }}>
                <PlayerNowPlaying
                  onBeforeNavigate={onBeforeNavigate}
                  onOpenHistory={onOpenHistory}
                  visualizerActive={visualizerActive && !expanded}
                />
              </View>
            </Animated.ScrollView>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
      {height > 0 && (
        <QueueScrollContext
          value={{
            offset: queueOffset,
            transition: queueTransition,
            onSnap: updateTrayPosition,
            onViewportHeightChange: setListHeight,
            expanded,
            subtitle,
            onToggle: toggleQueue,
          }}
        >
          <BottomSheet
            ref={sheetRef}
            index={0}
            animatedIndex={sheetIndex}
            containerStyle={{ marginHorizontal: Math.max(0, (width - 640) / 2) }}
            snapPoints={snapPoints}
            enableDynamicSizing={false}
            animateOnMount={false}
            enablePanDownToClose={false}
            enableContentPanningGesture
            enableHandlePanningGesture={!dragging}
            activeOffsetY={dragging ? [-1000000, 1000000] : [-8, 8]}
            handleComponent={QueueTrayHandle}
            backgroundComponent={TrayBackground}
            backdropComponent={backdrop}
            style={{
              marginHorizontal: 10,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -5 },
              shadowRadius: 18,
              shadowOpacity: 0.25,
              backgroundColor: '#123039',
              borderRadius: 28,
            }}
          >
            <View className="flex-1">
              <DraggableFlatList
                ref={listRef as never}
                renderScrollComponent={renderQueueScrollComponent}
                data={tracks}
                extraData={current?.identifier}
                keyExtractor={(track) => track.identifier}
                initialNumToRender={12}
                // Explicit bounds keep the native list in sync with the animated sheet layout.
                containerStyle={{ height: listHeight }}
                style={{ flex: 1, opacity: expanded || next ? 1 : 0 }}
                accessibilityElementsHidden={!expanded}
                contentContainerStyle={{ paddingBottom: bottomSpace }}
                scrollEnabled={expanded}
                bounces
                alwaysBounceVertical
                contentInsetAdjustmentBehavior="never"
                automaticallyAdjustContentInsets={false}
                automaticallyAdjustsScrollIndicatorInsets={false}
                scrollIndicatorInsets={{ top: 8, bottom: insets.bottom + 24, right: 4 }}
                onContentSizeChange={anchor.retryAfterLayout}
                onLayout={anchor.retryAfterLayout}
                onScrollToIndexFailed={anchor.onFailure}
                onViewableItemsChanged={({ viewableItems }) =>
                  anchor.onVisibleIndex(viewableItems[0]?.index)
                }
                onScrollBeginDrag={anchor.cancel}
                onDragBegin={() => {
                  anchor.cancel();
                  dragKeys.current = queueKeys;
                  setDragging(true);
                }}
                onDragEnd={({ from, to }) => {
                  setDragging(false);
                  if (!isQueueReorderCurrent(dragKeys.current, queueKeys)) return;
                  dragKeys.current = null;
                  player.queue.moveQueueTrack(from, to);
                }}
                renderItem={renderItem}
                ListEmptyComponent={
                  <RelistenText className="p-6 text-center text-gray-300">
                    Nothing is queued
                  </RelistenText>
                }
              />
              {!expanded && !next && (
                <RelistenText style={StyleSheet.absoluteFill} className="px-4 py-3 text-gray-300">
                  Nothing else is queued
                </RelistenText>
              )}
              {!expanded && (
                <QueuePeekGesture
                  onOpen={openQueue}
                  label={
                    next ? `Open queue, up next: ${playerDisplayTitle(next.title)}` : 'Open queue'
                  }
                />
              )}
            </View>
          </BottomSheet>
        </QueueScrollContext>
      )}
    </View>
  );
}
