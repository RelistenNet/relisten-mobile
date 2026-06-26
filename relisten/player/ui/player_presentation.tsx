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
  closePlayer: () => void;
  isPresentationActive: boolean;
  openPlayer: () => void;
  resetPlayerPresentation: () => void;
};

const PlayerPresentationContext = createContext<PlayerPresentationContextValue | undefined>(
  undefined
);

export function PlayerPresentationProvider({ children }: PropsWithChildren) {
  const [isPresentationActive, setIsPresentationActive] = useState(false);

  const finishClosing = useCallback(() => {
    setIsPresentationActive(false);
  }, []);

  const beginInteractivePresentation = useCallback(() => {
    cancelAnimation(playerPresentationProgress);
    setIsPresentationActive(true);
  }, []);

  const openPlayer = useCallback(() => {
    cancelAnimation(playerPresentationProgress);
    setIsPresentationActive(true);
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
    setIsPresentationActive(false);
  }, []);

  return (
    <PlayerPresentationContext.Provider
      value={{
        beginInteractivePresentation,
        closePlayer,
        isPresentationActive,
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
