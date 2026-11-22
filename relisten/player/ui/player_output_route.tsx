// Show an external destination without adding noise for the phone's own speaker.
// A Sonos room or Cast has its own connection state; the native module describes
// local playback.
import { type AudioOutputKind, nativePlayer } from '@/modules/relisten-audio-player';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useSonosRoomName } from '@/relisten/sonos/sonos_room_store';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Where music goes besides this phone's speaker, for picking an icon. */
export type PlayerOutputKind = 'sonos' | 'cast' | Exclude<AudioOutputKind, 'builtIn'>;

export interface PlayerOutput {
  name: string;
  kind: PlayerOutputKind;
}

/** The destination and its kind; null while playing on this phone's speaker. */
export function usePlayerOutput(): PlayerOutput | null {
  const sonosRoomName = useSonosRoomName();
  const { isCasting, deviceName } = useRelistenCastStatus();
  // The native module reports the system route on iOS and Android, not on web.
  const hasNativeRoute = Platform.OS !== 'web';
  const [route, setRoute] = useState(() =>
    hasNativeRoute ? nativePlayer.getAudioOutputRoute() : null
  );

  useEffect(() => {
    if (!hasNativeRoute) {
      return;
    }

    const subscription = nativePlayer.addAudioOutputRouteListener(setRoute);
    // Subscribe before reading so a route changed during mounting cannot be missed.
    setRoute(nativePlayer.getAudioOutputRoute());
    return () => subscription.remove();
  }, [hasNativeRoute]);

  if (sonosRoomName !== undefined) {
    return { name: sonosRoomName, kind: 'sonos' };
  }

  if (isCasting) {
    return { name: deviceName || 'Cast device', kind: 'cast' };
  }

  if (!route?.isExternal) {
    return null;
  }
  // Binaries built before the native side reported a kind show the generic
  // output icon (AirPlay's), never the speaker that means a Sonos room. An
  // external route is never `builtIn`.
  const kind = route.kind && route.kind !== 'builtIn' ? route.kind : 'other';
  return { name: route.name, kind };
}

/** Destination label for the expanded player. */
export function PlayerOutputRoute({
  cn,
}: {
  /** `cn`, not `className`: NativeWind v2 rewrites className on custom components into style. */
  cn?: string;
}) {
  const name = usePlayerOutput()?.name;
  if (!name) {
    return null;
  }

  return (
    <RelistenText cn={cn} numberOfLines={1} accessibilityLabel={`Audio output: ${name}`}>
      {name}
    </RelistenText>
  );
}
