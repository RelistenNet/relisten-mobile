// Show an external destination without adding noise for the phone's own speaker.
// Cast has its own connection state; the iOS audio session describes local playback.
import { nativePlayer } from '@/modules/relisten-audio-player';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Destination name for Cast or external iOS audio; null for local listening. */
export function usePlayerOutputRoute(): string | null {
  const { isCasting, deviceName } = useRelistenCastStatus();
  const [route, setRoute] = useState(() =>
    Platform.OS === 'ios' ? nativePlayer.getAudioOutputRoute() : null
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    const subscription = nativePlayer.addAudioOutputRouteListener(setRoute);
    // Subscribe before reading so a route changed during mounting cannot be missed.
    setRoute(nativePlayer.getAudioOutputRoute());
    return () => subscription.remove();
  }, []);

  if (isCasting) {
    return deviceName || 'Cast device';
  }

  return route?.isExternal ? route.name : null;
}

/** Destination label for the expanded player. */
export function PlayerOutputRoute({
  cn,
}: {
  /** `cn`, not `className`: NativeWind v2 rewrites className on custom components into style. */
  cn?: string;
}) {
  const name = usePlayerOutputRoute();
  if (!name) {
    return null;
  }

  return (
    <RelistenText
      cn={cn}
      numberOfLines={1}
      selectable={false}
      accessibilityLabel={`Audio output: ${name}`}
    >
      {name}
    </RelistenText>
  );
}
