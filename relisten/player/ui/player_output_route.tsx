// Show an external destination without adding noise for the phone's own speaker.
// A Sonos room or Cast has its own connection state; the iOS audio session describes
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

/** Destination name for a Sonos room, Cast or external iOS audio; null for local listening. */
export function usePlayerOutputRoute(): string | null {
  return usePlayerOutput()?.name ?? null;
}

/** The destination and its kind; null while playing on this phone's speaker. */
export function usePlayerOutput(): PlayerOutput | null {
  const sonosRoomName = useSonosRoomName();
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

  if (sonosRoomName !== undefined) {
    return { name: sonosRoomName, kind: 'sonos' };
  }

  if (isCasting) {
    return { name: deviceName || 'Cast device', kind: 'cast' };
  }

  if (!route?.isExternal) {
    return null;
  }
  // Binaries built before the native side reported a kind show AirPlay's icon:
  // it reads as "a system output", never as a Sonos room.
  const kind = route.kind && route.kind !== 'builtIn' ? route.kind : 'airplay';
  return { name: route.name, kind };
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
