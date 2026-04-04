import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { PlayerBottomBar } from './player_bottom_bar';
import { PlayerBarPlacementBackend, usePlayerBarPlacementBackend } from './player_bar_layout';

function assertNever(value: never): never {
  throw new Error(`Unhandled player bar placement backend: ${value}`);
}

function PlayerBarOverlayHost() {
  return <PlayerBottomBar placementBackend="overlay" />;
}

// Expo Router looks for a direct NativeTabs.BottomAccessory child when it builds
// the native tabs host, so this stays a render helper instead of a wrapper component.
export function renderPlayerBarNativeTabsAccessory(
  placementBackend: PlayerBarPlacementBackend,
  isVisible: boolean
) {
  if (placementBackend !== 'nativeTabsAccessory' || !isVisible) {
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
