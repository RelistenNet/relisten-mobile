import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { type ReactNode, useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useCastSession } from 'react-native-google-cast';
import colors from 'tailwindcss/colors';
import { useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import { RelistenBlue } from '@/relisten/relisten_blue';
import {
  sonosRoom,
  sonosRoomName,
  type SonosRoomState,
  useSonosRoom,
} from '@/relisten/sonos/sonos_room_store';
import { hasSystemVolumeSlider, SystemVolumeSlider } from './system_volume_slider';

const ICON_COLOR = 'rgba(255, 255, 255, 0.62)';

/**
 * The volume of wherever music plays: a Sonos room, a Chromecast, or this
 * phone and any AirPlay speaker it plays to. The row keeps one height for
 * every output, so the list below it never moves.
 */
export function OutputVolumeRow() {
  const sonos = useSonosRoom();
  const { isCasting } = useRelistenCastStatus();

  if (sonos.kind !== 'none') {
    return <SonosVolume remote={sonos} />;
  }
  if (isCasting) {
    return <CastVolume />;
  }
  if (hasSystemVolumeSlider) {
    return <VolumeRow slider={<SystemVolumeSlider />} />;
  }
  return null;
}

function VolumeRow({ leading, slider }: { leading?: ReactNode; slider?: ReactNode }) {
  return (
    <View className="h-11 flex-row items-center px-4" style={{ gap: 4 }}>
      {leading ?? <VolumeIcon name="volume-down" />}
      <View className="flex-1 flex-row">{slider}</View>
      <VolumeIcon name="volume-up" />
    </View>
  );
}

function VolumeIcon({ name }: { name: 'volume-down' | 'volume-up' }) {
  return (
    <View className="h-11 w-11 items-center justify-center">
      <MaterialIcons name={name} size={20} color={ICON_COLOR} />
    </View>
  );
}

function VolumeSlider({
  label,
  value,
  maximumValue,
  dimmed = false,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  maximumValue: number;
  dimmed?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Slider
      style={{ flex: 1, height: 44 }}
      accessibilityLabel={label}
      disabled={disabled}
      minimumValue={0}
      maximumValue={maximumValue}
      value={value}
      minimumTrackTintColor={dimmed ? 'rgba(255, 255, 255, 0.35)' : RelistenBlue['400']}
      maximumTrackTintColor="rgba(255, 255, 255, 0.52)"
      thumbTintColor={colors.gray[50]}
      onSlidingComplete={onChange}
    />
  );
}

/**
 * The Sonos group's volume and mute. Changes apply to the whole group, so
 * only the final slider value is sent. The store shows the group's last
 * known level until the room answers; a fixed-volume group can't change.
 */
function SonosVolume({ remote }: { remote: Exclude<SonosRoomState, { kind: 'none' }> }) {
  const volume = remote.kind === 'active' ? remote.volume : undefined;
  const roomName = sonosRoomName(remote);

  if (!volume) {
    return <VolumeRow />;
  }

  const { muted, fixed } = volume;
  return (
    <VolumeRow
      leading={
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={muted ? `Unmute ${roomName}` : `Mute ${roomName}`}
          accessibilityState={{ disabled: fixed }}
          disabled={fixed}
          className="h-11 w-11 items-center justify-center"
          onPress={() => void sonosRoom.setVolume({ muted: !muted })}
        >
          <MaterialIcons name={muted ? 'volume-off' : 'volume-down'} size={20} color={ICON_COLOR} />
        </TouchableOpacity>
      }
      slider={
        <VolumeSlider
          label={`${roomName} volume`}
          value={volume.volume}
          maximumValue={100}
          dimmed={muted}
          disabled={fixed}
          onChange={(value) => void sonosRoom.setVolume({ volume: value })}
        />
      }
    />
  );
}

/** The Cast device's volume, read when the controls open. */
function CastVolume() {
  const session = useCastSession();
  const [volume, setVolume] = useState<number>();

  useEffect(() => {
    let current = true;
    session
      ?.getVolume()
      .then((level) => current && setVolume(level))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [session]);

  if (!session || volume === undefined) {
    return <VolumeRow />;
  }
  return (
    <VolumeRow
      slider={
        <VolumeSlider
          label="Chromecast volume"
          value={volume}
          maximumValue={1}
          onChange={(value) => {
            setVolume(value);
            session.setVolume(value);
          }}
        />
      }
    />
  );
}
