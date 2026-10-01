import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { cancelAnimation, makeMutable, runOnJS, withSpring } from 'react-native-reanimated';
import { createPlayerCloseCompletion } from './player_close_completion';

export const playerPresentationProgress = makeMutable(0);

const PRESENTATION_SPRING = {
  damping: 32,
  mass: 0.65,
  overshootClamping: false,
  stiffness: 600,
} as const;

type PlayerPresentationContextValue = {
  beginInteractivePresentation: () => void;
  closePlayer: (afterClose?: () => void) => void;
  isPresentationActive: boolean;
  isPresentationMounted: boolean;
  openPlayer: () => void;
  resetPlayerPresentation: () => void;
};

type PlayerPresentationState = 'active' | 'idle';

const PlayerPresentationContext = createContext<PlayerPresentationContextValue | undefined>(
  undefined
);

export function PlayerPresentationProvider({ children }: PropsWithChildren) {
  const [presentationState, setPresentationState] = useState<PlayerPresentationState>('idle');
  const closeCompletion = useMemo(
    () => createPlayerCloseCompletion(() => setPresentationState('idle')),
    []
  );
  const cancelPendingClose = closeCompletion.cancel;

  useEffect(
    () => () => {
      closeCompletion.cancel();
      cancelAnimation(playerPresentationProgress);
    },
    [closeCompletion]
  );

  const beginInteractivePresentation = useCallback(() => {
    cancelPendingClose();
    cancelAnimation(playerPresentationProgress);
    setPresentationState('active');
  }, [cancelPendingClose]);

  const openPlayer = useCallback(() => {
    cancelPendingClose();
    cancelAnimation(playerPresentationProgress);
    setPresentationState('active');
    playerPresentationProgress.set(withSpring(1, PRESENTATION_SPRING));
  }, [cancelPendingClose]);

  const closePlayer = useCallback(
    (afterClose?: () => void) => {
      closeCompletion.cancel();
      cancelAnimation(playerPresentationProgress);
      // A fresh JS function per animation avoids reusing a remote function ID
      // after Worklets has released the previous animation's callback proxy.
      const completeClose = closeCompletion.begin(afterClose);
      playerPresentationProgress.set(
        withSpring(0, PRESENTATION_SPRING, (finished) => {
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
