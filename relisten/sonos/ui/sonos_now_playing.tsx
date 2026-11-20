import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useEffect } from 'react';
import { TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { sonosRemote, useSonosRemote } from '@/relisten/sonos/sonos_remote';

/**
 * The Sonos group's volume and mute, for the full player while a room plays.
 * Changes apply to the whole group, so only the final slider value is sent,
 * and the level is read back afterwards. A fixed-volume group can't change.
 */
export function SonosVolumeControl() {
  const remote = useSonosRemote();
  const handle = remote.kind === 'active' ? remote.playback.handle : undefined;

  useEffect(() => {
    if (handle) {
      void sonosRemote.refreshVolume();
    }
  }, [handle]);

  if (remote.kind !== 'active' || !remote.volume) {
    return null;
  }
  const { volume, muted, fixed } = remote.volume;
  const roomName = remote.playback.groupName;
  const iconColor = 'rgba(255, 255, 255, 0.62)';

  return (
    <View className="flex-row items-center" style={{ gap: 4 }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={muted ? `Unmute ${roomName}` : `Mute ${roomName}`}
        accessibilityState={{ disabled: fixed }}
        disabled={fixed}
        className="h-11 w-11 items-center justify-center"
        onPress={() => void sonosRemote.setVolume({ muted: !muted })}
      >
        <MaterialIcons name={muted ? 'volume-off' : 'volume-down'} size={20} color={iconColor} />
      </TouchableOpacity>
      <Slider
        style={{ flex: 1, height: 44 }}
        accessibilityLabel={`${roomName} volume`}
        disabled={fixed}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={volume}
        minimumTrackTintColor={muted ? 'rgba(255, 255, 255, 0.35)' : RelistenBlue['400']}
        maximumTrackTintColor="rgba(255, 255, 255, 0.52)"
        thumbTintColor={colors.gray[50]}
        onSlidingComplete={(value) => void sonosRemote.setVolume({ volume: value })}
      />
      <View className="h-11 w-11 items-center justify-center">
        <MaterialIcons name="volume-up" size={20} color={iconColor} />
      </View>
    </View>
  );
}
