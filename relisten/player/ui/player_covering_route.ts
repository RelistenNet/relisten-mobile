import { usePathname } from 'expo-router';
import { Platform } from 'react-native';

/**
 * Whether a screen opened from the player is showing over it. iOS presents
 * these screens as sheets above the player, and only history and the
 * equalizer take it over. Android pushes every screen outside the tabs into
 * the stack beneath the player overlay, so there any of them covers it and
 * the overlay has to step aside.
 */
export function usePlayerCoveredByRoute(): boolean {
  const pathname = usePathname();

  if (Platform.OS === 'android') {
    return !pathname.startsWith('/relisten/tabs');
  }

  return (
    pathname.startsWith('/relisten/audio-adjustments') ||
    pathname.startsWith('/relisten/player-history')
  );
}
