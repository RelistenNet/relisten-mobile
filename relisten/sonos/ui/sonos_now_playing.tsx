import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import colors from 'tailwindcss/colors';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { PlayOnButton } from '@/relisten/player/ui/play_on_button';
import {
  estimatedPositionMillis,
  hasNextOccurrence,
  hasPreviousOccurrence,
  isSonosPlaying,
  type SonosPlayback,
} from '@/relisten/sonos/sonos_playback';
import { sonosRemote, type SonosRemoteState } from '@/relisten/sonos/sonos_remote';

type LiveRemote = Exclude<SonosRemoteState, { kind: 'none' }>;

/** The playhead, advanced locally each second between room reads. */
function useSonosPosition(playback: SonosPlayback | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  const playing = playback ? isSonosPlaying(playback) : false;

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [playing]);

  return playback ? estimatedPositionMillis(playback, now) : 0;
}

function formatTime(millis: number) {
  const total = Math.floor(millis / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** What to show for the room: its playback once read, or that it is being checked. */
function describe(remote: LiveRemote) {
  if (remote.kind === 'checking') {
    return { roomName: remote.groupName, playback: undefined };
  }
  return { roomName: remote.playback.groupName, playback: remote.playback };
}

/**
 * Play/pause for the room. While a command waits for the room to confirm,
 * it shows a spinner; nothing is sent until the room has been read.
 */
function SonosPlayPauseButton({ remote, size }: { remote: LiveRemote; size: number }) {
  if (remote.kind === 'checking' || remote.pending) {
    return (
      <View style={{ width: size + 16, height: size + 16 }} className="items-center justify-center">
        <ActivityIndicator color="white" />
      </View>
    );
  }
  const playing = isSonosPlaying(remote.playback);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause Sonos' : 'Play on Sonos'}
      style={{ width: size + 16, height: size + 16 }}
      className="items-center justify-center rounded-full bg-white/10"
      onPress={() => void sonosRemote.command({ action: playing ? 'pause' : 'play' })}
    >
      <MaterialIcons name={playing ? 'pause' : 'play-arrow'} size={size} color="white" />
    </TouchableOpacity>
  );
}

function Artwork({ url, size }: { url: string | null | undefined; size: number }) {
  return url ? (
    <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: 6 }} />
  ) : (
    <View
      style={{ width: size, height: size, borderRadius: 6 }}
      className="items-center justify-center bg-white/10"
    >
      <MaterialIcons name="music-note" size={size / 2} color="rgba(255,255,255,0.6)" />
    </View>
  );
}

function ProgressLine({ position, duration }: { position: number; duration: number | null }) {
  const percent = duration ? Math.min(1, position / duration) : 0;
  return (
    <View className="h-1 overflow-hidden rounded-full bg-white/15">
      <View className="h-full bg-relisten-blue-300" style={{ width: `${percent * 100}%` }} />
    </View>
  );
}

/**
 * The mini player while a Sonos room plays this account's queue. It shows the
 * room's track, not the phone's, and Play/Pause goes to the room. Tapping it
 * opens Play On, where the room's full controls are.
 */
export function SonosMiniPlayer({ remote }: { remote: LiveRemote }) {
  const router = useRouter();
  const { roomName, playback } = describe(remote);
  const position = useSonosPosition(playback);
  const occurrence = playback?.occurrence;

  return (
    <View className="flex-1 justify-center">
      <View className="mb-1.5 flex-row items-center">
        <SonosPlayPauseButton remote={remote} size={24} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Open Play On, playing on ${roomName}`}
          className="ml-3 min-w-0 flex-1 flex-row items-center"
          onPress={() => router.push('/relisten/play-on')}
        >
          <Artwork url={occurrence?.imageUrl} size={36} />
          <View className="ml-2.5 min-w-0 flex-1">
            <RelistenText className="text-base font-semibold" numberOfLines={1}>
              {occurrence?.name ?? 'Checking Sonos…'}
            </RelistenText>
            <RelistenText className="text-sm text-slate-200" numberOfLines={1}>
              {[occurrence?.artist, `on ${roomName}`].filter(Boolean).join(' · ')}
            </RelistenText>
          </View>
        </TouchableOpacity>
        <PlayOnButton activeColor={RelistenBlue['200']} inactiveColor={RelistenBlue['200']} />
      </View>
      <ProgressLine position={position} duration={occurrence?.durationMillis ?? null} />
    </View>
  );
}

/**
 * The room's Now Playing at the top of the Play On sheet: the track, a seek
 * slider, Previous, Play/Pause and Next, and the group's volume. Controls wait
 * while a command is confirming or the room is being checked; every change is
 * confirmed by reading the room, not assumed.
 */
export function SonosNowPlayingPanel({ remote }: { remote: LiveRemote }) {
  const { roomName, playback } = describe(remote);
  const position = useSonosPosition(playback);
  const occurrence = playback?.occurrence;
  const commandError = remote.kind === 'active' ? remote.commandError : undefined;
  const ready = remote.kind === 'active' && !remote.pending;

  useEffect(() => {
    void sonosRemote.refreshVolume();
  }, [playback?.handle]);

  return (
    <View className="items-center px-6 pb-5 pt-3">
      <RelistenText className="text-sm font-semibold uppercase tracking-widest text-relisten-blue-300">
        Playing on {roomName}
      </RelistenText>
      <View className="my-4">
        <Artwork url={occurrence?.imageUrl} size={160} />
      </View>
      <RelistenText className="text-center text-xl font-semibold" numberOfLines={2}>
        {occurrence?.name ?? 'Checking Sonos…'}
      </RelistenText>
      {occurrence?.artist && (
        <RelistenText className="mt-0.5 text-center text-base text-gray-400" numberOfLines={1}>
          {occurrence.artist}
        </RelistenText>
      )}
      <SeekSlider
        position={position}
        durationMillis={occurrence?.durationMillis ?? null}
        enabled={ready && playback?.positionMillis !== null}
      />
      <View className="mt-2 flex-row items-center justify-center" style={{ gap: 28 }}>
        <TransportButton
          icon="skip-previous"
          label="Previous track"
          enabled={ready && !!playback && hasPreviousOccurrence(playback)}
          onPress={() => void sonosRemote.command({ action: 'previous' })}
        />
        <SonosPlayPauseButton remote={remote} size={36} />
        <TransportButton
          icon="skip-next"
          label="Next track"
          enabled={ready && !!playback && hasNextOccurrence(playback)}
          onPress={() => void sonosRemote.command({ action: 'next' })}
        />
      </View>
      {remote.kind === 'active' && remote.volume && (
        <VolumeControl volume={remote.volume} roomName={roomName} />
      )}
      {commandError && (
        <RelistenText className="mt-2 text-center text-sm text-[#e5c07b]">
          {commandError}
        </RelistenText>
      )}
    </View>
  );
}

function TransportButton({
  icon,
  label,
  enabled,
  onPress,
}: {
  icon: 'skip-previous' | 'skip-next';
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      className="h-11 w-11 items-center justify-center"
      style={{ opacity: enabled ? 1 : 0.35 }}
      onPress={onPress}
    >
      <MaterialIcons name={icon} size={32} color="white" />
    </TouchableOpacity>
  );
}

/**
 * The playhead as a slider. It follows the room until the listener drags,
 * then seeks once to where they let go. Without a known duration or
 * position there is nothing to seek within, so it only shows progress.
 */
function SeekSlider({
  position,
  durationMillis,
  enabled,
}: {
  position: number;
  durationMillis: number | null;
  enabled: boolean;
}) {
  const [dragging, setDragging] = useState<number | undefined>();
  const shown = dragging ?? position;
  const canSeek = enabled && durationMillis !== null;

  return (
    <View className="mt-4 w-full">
      {durationMillis ? (
        <Slider
          style={{ height: 32 }}
          accessibilityLabel="Position"
          disabled={!canSeek}
          minimumValue={0}
          maximumValue={durationMillis}
          value={shown}
          minimumTrackTintColor={RelistenBlue[300]}
          maximumTrackTintColor="rgba(255,255,255,0.15)"
          thumbTintColor={colors.gray[50]}
          onValueChange={setDragging}
          onSlidingComplete={(value) => {
            setDragging(undefined);
            void sonosRemote.command({ action: 'seek', positionMillis: value });
          }}
        />
      ) : (
        <ProgressLine position={position} duration={null} />
      )}
      <View className="flex-row justify-between">
        <RelistenText className="text-xs text-gray-400">{formatTime(shown)}</RelistenText>
        <RelistenText className="text-xs text-gray-400">
          {durationMillis ? formatTime(durationMillis) : ''}
        </RelistenText>
      </View>
    </View>
  );
}

/** The group's volume and mute. A fixed-volume group shows its level without a slider. */
function VolumeControl({
  volume,
  roomName,
}: {
  volume: { volume: number; muted: boolean; fixed: boolean };
  roomName: string;
}) {
  return (
    <View className="mt-4 w-full flex-row items-center" style={{ gap: 8 }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={volume.muted ? `Unmute ${roomName}` : `Mute ${roomName}`}
        disabled={volume.fixed}
        className="h-11 w-11 items-center justify-center"
        onPress={() => void sonosRemote.setVolume({ muted: !volume.muted })}
      >
        <MaterialIcons
          name={volume.muted ? 'volume-off' : 'volume-up'}
          size={22}
          color="rgba(255,255,255,0.78)"
        />
      </TouchableOpacity>
      <Slider
        style={{ flex: 1, height: 32 }}
        accessibilityLabel={`${roomName} volume`}
        disabled={volume.fixed}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={volume.volume}
        minimumTrackTintColor={volume.muted ? 'rgba(255,255,255,0.35)' : RelistenBlue[300]}
        maximumTrackTintColor="rgba(255,255,255,0.15)"
        thumbTintColor={colors.gray[50]}
        // Only the final value is sent: each change applies to the whole group.
        onSlidingComplete={(value) => void sonosRemote.setVolume({ volume: value })}
      />
    </View>
  );
}
