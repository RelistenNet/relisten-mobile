import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { RelistenText } from '@/relisten/components/relisten_text';
import {
  RelistenCastButton,
  useRelistenCastStatus,
  useShouldRenderCastButton,
} from '@/relisten/casting/cast_ui';
import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueue,
  useRelistenPlayerRepeatState,
  useRelistenPlayerShuffleState,
} from '@/relisten/player/relisten_player_queue_hooks';
import { PlayerRepeatState, PlayerShuffleState } from '@/relisten/player/relisten_player_queue';
import {
  playerDisplayDate,
  playerDisplayTitle,
  playerPosterDate,
} from '@/relisten/player/ui/player_display_helpers';
import { ScrubberRow } from '@/relisten/player/ui/player_scrubber';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { accessibleControlScale } from '@/relisten/util/accessible_control_scale';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Platform, Share, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import AirPlayButton from 'react-native-airplay-button';
import * as Progress from 'react-native-progress';
import Svg, { Line } from 'react-native-svg';

const WAVEFORM_BAR_COUNT = 96;
const WAVEFORM_BARS = Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
  const envelope = 0.3 + Math.sin((index / (WAVEFORM_BAR_COUNT - 1)) * Math.PI) ** 0.45 * 0.7;
  const detail = 0.25 + (((index * 47 + index * index * 13) % 97) / 96) * 0.75;

  return 7 + Math.round(envelope * detail * 48);
});

function WaveformPlaceholder() {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ aspectRatio: 5.5, width: '100%' }}
    >
      <Svg
        height="100%"
        preserveAspectRatio="none"
        viewBox={`0 0 ${WAVEFORM_BAR_COUNT * 2} 58`}
        width="100%"
      >
        <Line
          opacity={0.3}
          stroke={RelistenBlue['200']}
          strokeDasharray="0.5 1.5"
          strokeWidth="0.6"
          x1="0"
          x2={WAVEFORM_BAR_COUNT * 2}
          y1="29"
          y2="29"
        />
        {WAVEFORM_BARS.map((height, index) => {
          const x = index * 2 + 1;

          return (
            <Line
              key={`${index}-${height}`}
              opacity={0.55 + (index % 4) * 0.1}
              stroke={RelistenBlue['200']}
              strokeLinecap="round"
              strokeWidth="1"
              x1={x}
              x2={x}
              y1={29 - height / 2}
              y2={29 + height / 2}
            />
          );
        })}
      </Svg>
    </View>
  );
}

function ShowIdentity() {
  const currentTrack = useRelistenPlayerCurrentTrack()?.sourceTrack;
  const { width } = useWindowDimensions();

  if (!currentTrack) {
    return null;
  }

  const show = currentTrack.show;
  const venue = show.venue;
  const { day, month, year } = playerPosterDate(show.displayDate);
  const posterScale = Math.min(Math.max(width / 402, 0.82), 1.12);

  return (
    <View
      accessible
      accessibilityLabel={`${currentTrack.artist.name}, ${show.displayDate}${venue ? `, ${venue.name}, ${venue.location}` : ''}`}
      className="w-full items-center"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="w-full items-center"
      >
        <View className="w-full flex-row items-center gap-4 px-7">
          <View className="h-px flex-1 bg-relisten-blue-700/60" />
          <RelistenText
            adjustsFontSizeToFit
            allowFontScaling={false}
            className="min-w-0 shrink font-semibold uppercase text-relisten-blue-200/75"
            minimumFontScale={0.6}
            numberOfLines={1}
            selectable={false}
            style={{ fontSize: 13 * posterScale, letterSpacing: 5 * posterScale }}
          >
            {currentTrack.artist.name}
          </RelistenText>
          <View className="h-px flex-1 bg-relisten-blue-700/60" />
        </View>

        <View className="flex-row items-center justify-center gap-5">
          <RelistenText
            allowFontScaling={false}
            className="font-semibold text-relisten-blue-200/75"
            selectable={false}
            style={{ fontSize: 22 * posterScale, letterSpacing: 3 * posterScale }}
          >
            {month}
          </RelistenText>
          <View className="h-12 w-px bg-relisten-blue-600/70" />
          <RelistenText
            allowFontScaling={false}
            className="font-light leading-none text-relisten-blue-100/80"
            selectable={false}
            style={{ fontSize: 72 * posterScale }}
          >
            {day}
          </RelistenText>
          <View className="h-12 w-px bg-relisten-blue-600/70" />
          <RelistenText
            allowFontScaling={false}
            className="font-semibold text-relisten-blue-200/75"
            selectable={false}
            style={{ fontSize: 22 * posterScale, letterSpacing: 2 * posterScale }}
          >
            {year}
          </RelistenText>
        </View>

        {venue && (
          <View className="w-full items-center" style={{ marginTop: 2 }}>
            <View className="w-full flex-row items-center gap-4 px-7">
              <View className="h-px flex-1 bg-relisten-blue-700/60" />
              <RelistenText
                adjustsFontSizeToFit
                allowFontScaling={false}
                className="min-w-0 shrink font-semibold uppercase text-relisten-blue-200/70"
                minimumFontScale={0.72}
                numberOfLines={2}
                selectable={false}
                style={{
                  fontSize: 13 * posterScale,
                  letterSpacing: 3 * posterScale,
                  lineHeight: 18 * posterScale,
                  textAlign: 'center',
                }}
              >
                {venue.name}
              </RelistenText>
              <View className="h-px flex-1 bg-relisten-blue-700/60" />
            </View>
            <RelistenText
              adjustsFontSizeToFit
              allowFontScaling={false}
              className="w-full px-7 text-center uppercase text-relisten-blue-300/65"
              minimumFontScale={0.6}
              numberOfLines={1}
              selectable={false}
              style={{
                fontSize: 12 * posterScale,
                letterSpacing: 3 * posterScale,
                marginTop: 4,
              }}
            >
              {venue.location}
            </RelistenText>
          </View>
        )}
        <View className="w-full px-3" style={{ marginTop: 10 }}>
          <WaveformPlaceholder />
        </View>
      </View>
    </View>
  );
}

function CurrentTrackInfo() {
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const { isCasting, deviceName } = useRelistenCastStatus();
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const isAccessibilityLayout = fontScale >= 1.4;

  const track = currentPlayerTrack?.sourceTrack;
  const artist = track?.artist;
  const show = track?.show;
  const source = track?.source;

  if (!track || !artist || !show || !source) {
    return null;
  }

  const displayTitle = playerDisplayTitle(track.title);

  const onShare = () => {
    const [year, month, day] = show.displayDate.split('-');
    const url = `https://relisten.net/${artist.slug}/${year}/${month}/${day}/${track.slug}?source=${source.uuid}`;
    void Share.share({
      message: `Check out ${track.title} (${track.humanizedDuration}) by ${artist.name} (${show.displayDate}) on @relistenapp${Platform.OS === 'ios' ? '' : `: ${url}`}`,
      url,
    });
  };

  const shareButton = (
    <TouchableOpacity
      accessibilityLabel="Share current track"
      accessibilityRole="button"
      className="items-center justify-center rounded-full border border-white/25 bg-white/5"
      onPress={onShare}
      style={{ minHeight: 44 * controlScale, minWidth: 44 * controlScale }}
    >
      <MaterialIcons
        color="white"
        name={Platform.OS === 'ios' ? 'ios-share' : 'share'}
        size={21 * controlScale}
      />
    </TouchableOpacity>
  );

  return (
    <View className="px-6">
      {isAccessibilityLayout ? (
        <View className="gap-2">
          <RelistenText className="text-2xl font-bold leading-tight">{displayTitle}</RelistenText>
          <View className="items-end">{shareButton}</View>
        </View>
      ) : (
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <RelistenText className="text-2xl font-bold leading-tight" numberOfLines={2}>
              {displayTitle}
            </RelistenText>
          </View>
          {shareButton}
        </View>
      )}
      <RelistenText
        className="text-lg"
        numberOfLines={fontScale < 1.4 ? 1 : undefined}
        style={{ marginTop: 4 }}
      >
        {artist.name} · {playerDisplayDate(show.displayDate)}
      </RelistenText>
      {show.venue && (
        <RelistenText
          className="text-base text-gray-400"
          numberOfLines={fontScale < 1.4 ? 1 : undefined}
          style={{ marginTop: 2 }}
        >
          {show.venue.name} · {show.venue.location}
        </RelistenText>
      )}
      {isCasting && (
        <RelistenText
          className="text-sm text-relisten-blue-200"
          numberOfLines={1}
          style={{ marginTop: 4 }}
        >
          Casting{deviceName ? ` to ${deviceName}` : ''}
        </RelistenText>
      )}
    </View>
  );
}

function PlayerControls() {
  const player = useRelistenPlayer();
  const playbackState = useRelistenPlayerPlaybackState();
  const { fontScale, width } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);
  const playSize = 64 * controlScale;

  let playbackStateIcon = (
    <MaterialIcons color="white" name="play-arrow" size={46 * controlScale} />
  );
  let playbackLabel = 'Play';

  if (playbackState === RelistenPlaybackState.Playing) {
    playbackStateIcon = <MaterialIcons color="white" name="pause" size={46 * controlScale} />;
    playbackLabel = 'Pause';
  } else if (playbackState === RelistenPlaybackState.Stalled) {
    playbackStateIcon = (
      <Progress.CircleSnail color="white" indeterminate size={34 * controlScale} />
    );
    playbackLabel = 'Buffering';
  }

  return (
    <View
      className="flex-row items-center justify-between"
      style={{ paddingHorizontal: Math.max(width * 0.225, 48) }}
    >
      <TouchableOpacity
        accessibilityLabel="Previous track"
        accessibilityRole="button"
        className="items-center justify-center"
        onPress={() => player.back()}
        style={{ minHeight: 44 * controlScale, minWidth: 44 * controlScale }}
      >
        <MaterialCommunityIcons color="white" name="skip-backward" size={34 * controlScale} />
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel={playbackLabel}
        accessibilityRole="button"
        className="items-center justify-center rounded-full border border-white/30 bg-white/5"
        onPress={() => player.togglePauseResume()}
        style={{ height: playSize, width: playSize }}
      >
        {playbackStateIcon}
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel="Next track"
        accessibilityRole="button"
        accessibilityState={{ disabled: player.queue.isCurrentTrackLast }}
        className="items-center justify-center"
        disabled={player.queue.isCurrentTrackLast}
        onPress={() => player.next()}
        style={{
          minHeight: 44 * controlScale,
          minWidth: 44 * controlScale,
          opacity: player.queue.isCurrentTrackLast ? 0.4 : 1,
        }}
      >
        <MaterialCommunityIcons color="white" name="skip-forward" size={34 * controlScale} />
      </TouchableOpacity>
    </View>
  );
}

function PlayerSecondaryControls() {
  const queue = useRelistenPlayerQueue();
  const [shuffleState] = useRelistenPlayerShuffleState();
  const [repeatState] = useRelistenPlayerRepeatState();
  const shouldRenderCastButton = useShouldRenderCastButton();
  const { fontScale } = useWindowDimensions();
  const controlScale = accessibleControlScale(fontScale);

  const isShuffleOn = shuffleState === PlayerShuffleState.SHUFFLE_ON;
  const isRepeatTrack = repeatState === PlayerRepeatState.REPEAT_TRACK;
  const isRepeatQueue = repeatState === PlayerRepeatState.REPEAT_QUEUE;
  const isRepeatOn = isRepeatTrack || isRepeatQueue;
  const inactiveColor = 'rgba(255, 255, 255, 0.62)';

  const toggleShuffle = () => {
    queue.setShuffleState(
      isShuffleOn ? PlayerShuffleState.SHUFFLE_OFF : PlayerShuffleState.SHUFFLE_ON
    );
  };

  const toggleRepeat = () => {
    const nextRepeatState =
      repeatState === PlayerRepeatState.REPEAT_OFF
        ? PlayerRepeatState.REPEAT_QUEUE
        : repeatState === PlayerRepeatState.REPEAT_QUEUE
          ? PlayerRepeatState.REPEAT_TRACK
          : PlayerRepeatState.REPEAT_OFF;

    queue.setRepeatState(nextRepeatState);
  };

  const touchSize = 44 * controlScale;
  const visualSize = 36 * controlScale;
  const iconSize = 20 * controlScale;

  return (
    <View className="flex-row items-center justify-between px-10">
      <TouchableOpacity
        accessibilityLabel={isShuffleOn ? 'Turn shuffle off' : 'Turn shuffle on'}
        accessibilityRole="button"
        accessibilityState={{ selected: isShuffleOn }}
        className="items-center justify-center"
        onPress={toggleShuffle}
        style={{ height: touchSize, width: touchSize }}
      >
        <View
          className="items-center justify-center rounded-full border border-white/25 bg-white/5"
          style={{ height: visualSize, width: visualSize }}
        >
          <MaterialCommunityIcons
            color={isShuffleOn ? RelistenBlue['300'] : inactiveColor}
            name="shuffle"
            size={iconSize}
          />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel="Change repeat mode"
        accessibilityRole="button"
        accessibilityState={{ selected: isRepeatOn }}
        className="items-center justify-center"
        onPress={toggleRepeat}
        style={{ height: touchSize, width: touchSize }}
      >
        <View
          className="items-center justify-center rounded-full border border-white/25 bg-white/5"
          style={{ height: visualSize, width: visualSize }}
        >
          <MaterialCommunityIcons
            color={isRepeatOn ? RelistenBlue['300'] : inactiveColor}
            name={isRepeatTrack ? 'repeat-once' : 'repeat'}
            size={iconSize}
          />
        </View>
      </TouchableOpacity>
      {shouldRenderCastButton && (
        <View
          className="items-center justify-center"
          style={{ height: touchSize, width: touchSize }}
        >
          <View
            className="items-center justify-center rounded-full border border-white/25 bg-white/5"
            style={{ height: visualSize, width: visualSize }}
          >
            <RelistenCastButton className="h-5 w-5" tintColor={inactiveColor} />
          </View>
        </View>
      )}
      {Platform.OS === 'ios' && (
        <View
          className="items-center justify-center"
          style={{ height: touchSize, width: touchSize }}
        >
          <View
            className="items-center justify-center rounded-full border border-white/25 bg-white/5"
            style={{ height: visualSize, width: visualSize }}
          >
            <AirPlayButton
              activeTintColor="white"
              className="h-5 w-5"
              prioritizesVideoDevices={false}
              tintColor={inactiveColor}
            />
          </View>
        </View>
      )}
    </View>
  );
}

export function PlayerNowPlaying() {
  const currentTrack = useRelistenPlayerCurrentTrack();
  const { fontScale } = useWindowDimensions();
  const showDecorativeIdentity = fontScale < 1.4;

  if (!currentTrack) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <RelistenText className="text-center text-xl font-semibold">
          Nothing is playing
        </RelistenText>
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: 12, paddingTop: showDecorativeIdentity ? 4 : 24 }}>
      {showDecorativeIdentity && <ShowIdentity />}
      <View style={{ marginTop: showDecorativeIdentity ? 14 : 0 }}>
        <CurrentTrackInfo />
      </View>
      <View className="px-6" style={{ marginTop: 18 }}>
        <ScrubberRow subduedCache />
      </View>
      <View style={{ marginTop: 4 }}>
        <PlayerControls />
      </View>
      <View style={{ marginTop: 8 }}>
        <PlayerSecondaryControls />
      </View>
    </View>
  );
}
