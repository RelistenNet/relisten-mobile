import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export const PLAYER_SHEET_STATES = {
  collapsed: 'collapsed',
  expanded: 'expanded',
} as const;

export type PlayerSheetState = (typeof PLAYER_SHEET_STATES)[keyof typeof PLAYER_SHEET_STATES];
export type PlayerSheetProgress = 0 | 1;

export const PLAYER_SHEET_SNAP_PROGRESS: Record<PlayerSheetState, PlayerSheetProgress> = {
  collapsed: 0,
  expanded: 1,
};

export interface PlayerSheetSnapPointMetadata {
  state: PlayerSheetState;
  progress: PlayerSheetProgress;
}

export interface PlayerSheetSnapMetadata {
  collapsed: PlayerSheetSnapPointMetadata;
  expanded: PlayerSheetSnapPointMetadata;
  current: PlayerSheetSnapPointMetadata;
  target: PlayerSheetSnapPointMetadata;
}

export interface PlayerSheetStateController {
  sheetState: PlayerSheetState;
  targetSheetState: PlayerSheetState;
  sheetProgress: PlayerSheetProgress;
  sheetProgressTarget: PlayerSheetProgress;
  snapMetadata: PlayerSheetSnapMetadata;
  isCollapsed: boolean;
  isExpanded: boolean;
  setSheetState: (nextState: PlayerSheetState) => void;
  expand: () => void;
  collapse: () => void;
  toggle: () => void;
}

const DEFAULT_SHEET_STATE: PlayerSheetState = PLAYER_SHEET_STATES.collapsed;

const PlayerSheetStateContext = createContext<PlayerSheetStateController | undefined>(undefined);

export const isPlayerSheetState = (value: string): value is PlayerSheetState => {
  return value === PLAYER_SHEET_STATES.collapsed || value === PLAYER_SHEET_STATES.expanded;
};

export const assertPlayerSheetState = (value: string): PlayerSheetState => {
  if (!isPlayerSheetState(value)) {
    throw new Error(`Unsupported player sheet state: ${value}`);
  }

  return value;
};

export const playerSheetProgressForState = (sheetState: PlayerSheetState): PlayerSheetProgress => {
  return PLAYER_SHEET_SNAP_PROGRESS[sheetState];
};

export const PlayerSheetStateProvider = ({ children }: PropsWithChildren) => {
  const [sheetState, setSheetStateInternal] = useState<PlayerSheetState>(DEFAULT_SHEET_STATE);
  const [targetSheetState, setTargetSheetState] = useState<PlayerSheetState>(DEFAULT_SHEET_STATE);

  const setSheetState = useCallback((nextState: PlayerSheetState) => {
    setTargetSheetState(nextState);
    setSheetStateInternal(nextState);
  }, []);

  const expand = useCallback(() => {
    setSheetState(PLAYER_SHEET_STATES.expanded);
  }, [setSheetState]);

  const collapse = useCallback(() => {
    setSheetState(PLAYER_SHEET_STATES.collapsed);
  }, [setSheetState]);

  const toggle = useCallback(() => {
    setSheetState(
      sheetState === PLAYER_SHEET_STATES.expanded
        ? PLAYER_SHEET_STATES.collapsed
        : PLAYER_SHEET_STATES.expanded
    );
  }, [setSheetState, sheetState]);

  const sheetProgress = playerSheetProgressForState(sheetState);
  const sheetProgressTarget = playerSheetProgressForState(targetSheetState);

  const snapMetadata = useMemo<PlayerSheetSnapMetadata>(
    () => ({
      collapsed: {
        state: PLAYER_SHEET_STATES.collapsed,
        progress: PLAYER_SHEET_SNAP_PROGRESS.collapsed,
      },
      expanded: {
        state: PLAYER_SHEET_STATES.expanded,
        progress: PLAYER_SHEET_SNAP_PROGRESS.expanded,
      },
      current: {
        state: sheetState,
        progress: sheetProgress,
      },
      target: {
        state: targetSheetState,
        progress: sheetProgressTarget,
      },
    }),
    [sheetProgress, sheetProgressTarget, sheetState, targetSheetState]
  );

  const value = useMemo<PlayerSheetStateController>(
    () => ({
      sheetState,
      targetSheetState,
      sheetProgress,
      sheetProgressTarget,
      snapMetadata,
      isCollapsed: sheetState === PLAYER_SHEET_STATES.collapsed,
      isExpanded: sheetState === PLAYER_SHEET_STATES.expanded,
      setSheetState,
      expand,
      collapse,
      toggle,
    }),
    [
      collapse,
      expand,
      setSheetState,
      sheetProgress,
      sheetProgressTarget,
      sheetState,
      snapMetadata,
      targetSheetState,
      toggle,
    ]
  );

  return (
    <PlayerSheetStateContext.Provider value={value}>{children}</PlayerSheetStateContext.Provider>
  );
};

export const usePlayerSheetStateController = () => {
  const context = useContext(PlayerSheetStateContext);

  if (context === undefined) {
    throw new Error('usePlayerSheetStateController must be used within a PlayerSheetStateProvider');
  }

  return context;
};

export const usePlayerSheetProgress = () => {
  const { sheetProgress, sheetProgressTarget } = usePlayerSheetStateController();

  return { sheetProgress, sheetProgressTarget };
};

export const usePlayerSheetControls = () => {
  const { setSheetState, expand, collapse, toggle } = usePlayerSheetStateController();

  return { setSheetState, expand, collapse, toggle };
};
