import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { cancelAnimation, makeMutable, runOnJS, withSpring } from 'react-native-reanimated';

export const playerPresentationProgress = makeMutable(0);

const PRESENTATION_SPRING = {
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
  resetPlayerPresentation: () => void;
};

type PlayerPresentationState = 'active' | 'idle';

const PlayerPresentationContext = createContext<PlayerPresentationContextValue | undefined>(
  undefined
);

export function PlayerPresentationProvider({ children }: PropsWithChildren) {
  const [presentationState, setPresentationState] = useState<PlayerPresentationState>('idle');
  const afterCloseRef = useRef<(() => void) | undefined>(undefined);

  const cancelPendingClose = useCallback(() => {
    afterCloseRef.current = undefined;
  }, []);

  const finishClosing = useCallback(() => {
    const afterClose = afterCloseRef.current;
    afterCloseRef.current = undefined;
    setPresentationState('idle');
    afterClose?.();
  }, []);

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
      afterCloseRef.current = afterClose;
      cancelAnimation(playerPresentationProgress);
      playerPresentationProgress.set(
        withSpring(0, PRESENTATION_SPRING, (finished) => {
          if (finished) {
            runOnJS(finishClosing)();
          }
        })
      );
    },
    [finishClosing]
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
