import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { usePlayerOutputRoute } from '@/relisten/player/ui/player_output_route';

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
  const outputRoute = usePlayerOutputRoute();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={outputRoute ? `Play on, playing through ${outputRoute}` : 'Play on'}
      className="h-11 w-11 items-center justify-center"
      // Opens over the full player, like Audio Adjustments, so the listener stays in it.
      onPress={() => router.push('/relisten/play-on')}
    >
      <MaterialCommunityIcons
        name="speaker-wireless"
        size={22}
        color={outputRoute ? activeColor : inactiveColor}
      />
    </TouchableOpacity>
  );
}
