import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { type PlayerOutputKind, usePlayerOutput } from '@/relisten/player/ui/player_output_route';

/**
 * The one button for where music plays. It opens the Play On sheet, which
 * holds this phone, Sonos rooms, AirPlay and Chromecast. Tinted while audio
 * goes somewhere other than this phone.
 */
export function PlayOnButton({
  activeColor,
  inactiveColor,
}: {
  activeColor: string;
  inactiveColor: string;
}) {
  const router = useRouter();
  const output = usePlayerOutput();
  const color = output ? activeColor : inactiveColor;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={output ? `Play on, playing through ${output.name}` : 'Play on'}
      className="h-11 w-11 items-center justify-center"
      // Opens over the full player, like Audio Adjustments, so the listener stays in it.
      onPress={() => router.push('/relisten/play-on')}
    >
      <OutputIcon kind={output?.kind} color={color} />
    </TouchableOpacity>
  );
}

/**
 * The speaker icon means a Sonos room (or this phone, untinted), so other
 * outputs each get their own icon: playing over Bluetooth shouldn't look like
 * it's playing in a room.
 */
function OutputIcon({ kind, color }: { kind: PlayerOutputKind | undefined; color: string }) {
  switch (kind) {
    case undefined:
    case 'sonos':
      return <MaterialCommunityIcons name="speaker-wireless" size={22} color={color} />;
    case 'cast':
      return <MaterialIcons name="cast-connected" size={22} color={color} />;
    case 'bluetooth':
      return <MaterialCommunityIcons name="bluetooth-audio" size={22} color={color} />;
    case 'wired':
      return <MaterialCommunityIcons name="headphones" size={22} color={color} />;
    case 'car':
      return <MaterialCommunityIcons name="car" size={22} color={color} />;
    case 'airplay':
    case 'other':
      return <MaterialIcons name="airplay" size={22} color={color} />;
  }
}
