import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cancelAnimation, makeMutable, runOnJS, withSpring } from 'react-native-reanimated';
import { createPlayerCloseCompletion } from './player_close_completion';

export const playerPresentationProgress = makeMutable(0);
export const playerPresentationContentReady = makeMutable(false);

// Whole-player transitions are independent of the native timeline snap motion.
const MODAL_PRESENTATION_SPRING = {
  damping: 30,
  mass: 0.82,
  overshootClamping: true,
  stiffness: 300,
} as const;

type PlayerPresentationContextValue = {
  beginInteractivePresentation: () => void;
  closePlayer: (afterClose?: () => void) => void;
  isPresentationActive: boolean;
  isPresentationMounted: boolean;
  openPlayer: () => void;
  markPlayerContentReady: () => void;
  resetPlayerPresentation: () => void;
};

type PlayerPresentationState = 'active' | 'idle';

const PlayerPresentationContext = createContext<PlayerPresentationContextValue | undefined>(
  undefined
);

export function PlayerPresentationProvider({ children }: PropsWithChildren) {
  const [presentationState, setPresentationState] = useState<PlayerPresentationState>('idle');
  const presentationRequested = useRef(false);
  const pendingOpen = useRef(false);
  const closeCompletion = useMemo(
    () =>
      createPlayerCloseCompletion(() => {
        playerPresentationContentReady.set(false);
        setPresentationState('idle');
      }),
    []
  );
  const cancelPendingClose = closeCompletion.cancel;

  useEffect(
    () => () => {
      closeCompletion.cancel();
      presentationRequested.current = false;
      pendingOpen.current = false;
      playerPresentationContentReady.set(false);
      cancelAnimation(playerPresentationProgress);
    },
    [closeCompletion]
  );

  const beginInteractivePresentation = useCallback(() => {
    cancelPendingClose();
    cancelAnimation(playerPresentationProgress);
    presentationRequested.current = true;
    pendingOpen.current = false;
    setPresentationState('active');
  }, [cancelPendingClose]);

  const openPlayer = useCallback(() => {
    cancelPendingClose();
    cancelAnimation(playerPresentationProgress);
    presentationRequested.current = true;
    pendingOpen.current = !playerPresentationContentReady.value;
    setPresentationState('active');
    if (!pendingOpen.current) {
      playerPresentationProgress.set(withSpring(1, MODAL_PRESENTATION_SPRING));
    }
  }, [cancelPendingClose]);

  const markPlayerContentReady = useCallback(() => {
    if (!presentationRequested.current) return;
    // Called after the anchored timeline has committed its visible content.
    playerPresentationContentReady.set(true);
    if (pendingOpen.current) {
      pendingOpen.current = false;
      playerPresentationProgress.set(withSpring(1, MODAL_PRESENTATION_SPRING));
    }
  }, []);

  const closePlayer = useCallback(
    (afterClose?: () => void) => {
      presentationRequested.current = false;
      pendingOpen.current = false;
      closeCompletion.cancel();
      cancelAnimation(playerPresentationProgress);
      // A fresh JS function per animation avoids reusing a remote function ID
      // after Worklets has released the previous animation's callback proxy.
      const completeClose = closeCompletion.begin(afterClose);
      playerPresentationProgress.set(
        withSpring(0, MODAL_PRESENTATION_SPRING, (finished) => {
          if (finished) {
            runOnJS(completeClose)();
          }
        })
      );
    },
    [closeCompletion]
  );

  const resetPlayerPresentation = useCallback(() => {
    cancelPendingClose();
    cancelAnimation(playerPresentationProgress);
    presentationRequested.current = false;
    pendingOpen.current = false;
    playerPresentationContentReady.set(false);
    playerPresentationProgress.set(0);
    setPresentationState('idle');
  }, [cancelPendingClose]);

  return (
    <PlayerPresentationContext.Provider
      value={{
        beginInteractivePresentation,
        closePlayer,
        isPresentationActive: presentationState === 'active',
        isPresentationMounted: presentationState === 'active',
        openPlayer,
        markPlayerContentReady,
        resetPlayerPresentation,
      }}
    >
      {children}
    </PlayerPresentationContext.Provider>
  );
}

export function usePlayerPresentation() {
  const context = useContext(PlayerPresentationContext);

  if (!context) {
    throw new Error('usePlayerPresentation must be used within PlayerPresentationProvider');
  }

  return context;
}
