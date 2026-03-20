import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { PlayerBottomBar } from './player_bottom_bar';
import { PlayerBarPlacementBackend, usePlayerBarPlacementBackend } from './player_bar_layout';

function assertNever(value: never): never {
  throw new Error(`Unhandled player bar placement backend: ${value}`);
}

function PlayerBarOverlayHost() {
  return <PlayerBottomBar placementBackend="overlay" />;
}

export function renderPlayerBarNativeTabsAccessory(placementBackend: PlayerBarPlacementBackend) {
  if (placementBackend !== 'nativeTabsAccessory') {
    return null;
  }

  return (
    <NativeTabs.BottomAccessory>
      <PlayerBottomBar placementBackend="nativeTabsAccessory" />
    </NativeTabs.BottomAccessory>
  );
}

interface PlayerBarHostProps {
  placementBackend?: PlayerBarPlacementBackend;
}

export function PlayerBarHost({ placementBackend: providedPlacementBackend }: PlayerBarHostProps) {
  const detectedPlacementBackend = usePlayerBarPlacementBackend();
  const placementBackend = providedPlacementBackend ?? detectedPlacementBackend;

  switch (placementBackend) {
    case 'nativeTabsAccessory':
      return null;
    case 'overlay':
      return <PlayerBarOverlayHost />;
    default:
      return assertNever(placementBackend);
  }
}
