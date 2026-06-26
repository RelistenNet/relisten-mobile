import { type PropsWithChildren, createContext, useCallback, useContext, useState } from 'react';
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
  cancelPreparedPresentation: () => void;
  closePlayer: () => void;
  isPresentationActive: boolean;
  isPresentationMounted: boolean;
  openPlayer: () => void;
  preparePlayerPresentation: () => void;
  resetPlayerPresentation: () => void;
};

type PlayerPresentationState = 'active' | 'idle' | 'prepared';

const PlayerPresentationContext = createContext<PlayerPresentationContextValue | undefined>(
  undefined
);

export function PlayerPresentationProvider({ children }: PropsWithChildren) {
  const [presentationState, setPresentationState] = useState<PlayerPresentationState>('idle');

  const finishClosing = useCallback(() => {
    setPresentationState('idle');
  }, []);

  const preparePlayerPresentation = useCallback(() => {
    setPresentationState((state) => (state === 'idle' ? 'prepared' : state));
  }, []);

  const cancelPreparedPresentation = useCallback(() => {
    setPresentationState((state) => (state === 'prepared' ? 'idle' : state));
  }, []);

  const beginInteractivePresentation = useCallback(() => {
    cancelAnimation(playerPresentationProgress);
    setPresentationState('active');
  }, []);

  const openPlayer = useCallback(() => {
    cancelAnimation(playerPresentationProgress);
    setPresentationState('active');
    playerPresentationProgress.set(withSpring(1, PRESENTATION_SPRING));
  }, []);

  const closePlayer = useCallback(() => {
    cancelAnimation(playerPresentationProgress);
    playerPresentationProgress.set(
      withSpring(0, PRESENTATION_SPRING, (finished) => {
        if (finished) {
          runOnJS(finishClosing)();
        }
      })
    );
  }, [finishClosing]);

  const resetPlayerPresentation = useCallback(() => {
    cancelAnimation(playerPresentationProgress);
    playerPresentationProgress.set(0);
    setPresentationState('idle');
  }, []);

  return (
    <PlayerPresentationContext.Provider
      value={{
        beginInteractivePresentation,
        cancelPreparedPresentation,
        closePlayer,
        isPresentationActive: presentationState === 'active',
        isPresentationMounted: presentationState !== 'idle',
        openPlayer,
        preparePlayerPresentation,
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
